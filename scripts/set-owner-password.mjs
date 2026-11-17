// Sets the Owner-mode password on this machine (the server). Usage: node scripts/set-owner-password.mjs <password>   (8+ characters)
import { setPassword } from '../server/owner.mjs'
const pw = process.argv[2]
if (!pw) { console.error('usage: node scripts/set-owner-password.mjs <password>'); process.exit(1) }
setPassword(pw); console.log('Owner password set. Restart is not needed; owners already logged in stay logged in until their cookie expires.')
