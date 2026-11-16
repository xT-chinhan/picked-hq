import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

/** Serve the same fixture protocol over child stdio or in-memory test streams. */
export function serve(input, output, mode, exit = code => process.exit(code)) {
if (mode === 'exit') { exit(0); return; }
let initialized = false;
const tool = name => ({ name, description: `Công cụ ${name}`, inputSchema: { type: 'object' } });
const send = value => output.write(`${JSON.stringify(value)}\n`);
createInterface({ input }).on('line', line => {
  const message = JSON.parse(line);
  const { id, method, params } = message;
  if (method === 'notifications/initialized') { initialized = true; return; }
  if (method === 'initialize') {
    if (mode === 'hang') return;
    if (mode === 'rpc-error') {
      send({ jsonrpc: '2.0', id, error: { code: -32603, message: 'private-secret' } });
      return;
    }
    if (params.protocolVersion !== '2025-06-18' || params.clientInfo.name !== 'picked' ||
        params.clientInfo.version !== '1.0.0' || Object.keys(params.capabilities).length) exit(2);
    output.write('diagnostic noise\n');
    send({ jsonrpc: '2.0', method: 'notifications/message', params: {} });
    send({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } });
  } else if (method === 'tools/list') {
    if (!initialized) exit(3);
    const result = params.cursor
      ? { tools: [tool('fail'), tool('slow')] }
      : { tools: [tool('echo')], nextCursor: 'page2' };
    const response = JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n';
    const midpoint = Math.floor(response.length / 2);
    output.write(response.slice(0, midpoint));
    setTimeout(() => output.write(response.slice(midpoint)), 5);
  } else if (method === 'tools/call') {
    if (params.name === 'slow') return;
    if (params.arguments.exit) { exit(0); return; }
    const respond = () => send({ jsonrpc: '2.0', id, result: {
      content: [{ type: 'text', text: params.arguments.text ?? 'Thất bại' },
        { type: 'image', data: 'ignored' }, ...(params.arguments.extra ? [{ type: 'text', text: 'thêm' }] : [])],
      isError: params.name === 'fail',
    } });
    setTimeout(respond, params.arguments.delay ?? 0);
  }
});

}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  serve(process.stdin, process.stdout, process.argv[2]);
}
