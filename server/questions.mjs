/* Buyer questions. The hop-com bank is hand-written; any other category falls back to templates. */
const HOP_COM = [
  'Hộp cơm giữ nhiệt tốt ở TP.HCM nên mua thương hiệu nào?', 'Mua hộp cơm giữ nhiệt ở Quận 7 ở đâu?', 'Hộp cơm giữ nhiệt dưới 300k loại nào tốt?',
  'Hộp cơm giữ nhiệt an toàn cho trẻ em đi học loại nào?', 'Hộp cơm giữ nhiệt giữ nóng được 6 tiếng loại nào?', 'Quà tặng nhân viên văn phòng dưới 300k nên mua gì?',
  'Hộp cơm giữ nhiệt inox hay thủy tinh tốt hơn?', 'Mua hộp cơm giữ nhiệt số lượng lớn cho công ty ở đâu?', 'Hộp cơm giữ nhiệt không rò rỉ mang trong cặp đi học loại nào?',
  'Hộp cơm giữ nhiệt 3 ngăn loại nào tốt?', 'Hộp cơm giữ nhiệt dùng được trong lò vi sóng loại nào?', 'Thương hiệu hộp cơm giữ nhiệt uy tín nhất Việt Nam 2026?',
  'Cửa hàng bán hộp cơm giữ nhiệt gần Phú Mỹ Hưng?', 'Hộp cơm giữ nhiệt không chứa BPA cho bé loại nào?', 'Hộp cơm giữ nhiệt in logo làm quà tặng doanh nghiệp ở đâu?',
  'Hộp cơm giữ nhiệt nào giao hàng trong ngày ở TP.HCM?', 'Cặp lồng giữ nhiệt hay hộp cơm giữ nhiệt tốt hơn cho dân văn phòng?', 'Hộp cơm giữ nhiệt giá rẻ dưới 200k loại nào?',
  'Hộp cơm giữ nhiệt cao cấp trên 500k có đáng mua không?', 'Hộp cơm giữ nhiệt nhỏ gọn cho dân văn phòng nữ loại nào?', 'Hộp cơm giữ nhiệt nào dễ vệ sinh nhất?',
  'Hộp cơm giữ nhiệt nào giữ lạnh được cả ngày?', 'Mua hộp cơm giữ nhiệt trên Shopee hay ra cửa hàng tốt hơn?', 'Hộp cơm giữ nhiệt cho công nhân nhà máy mang đi ăn trưa loại nào?',
  'Hộp cơm giữ nhiệt có túi đựng kèm loại nào tốt?', 'Hộp cơm giữ nhiệt cho người ăn kiêng eat clean loại nào?', 'Hộp cơm giữ nhiệt Nhật Bản chính hãng mua ở đâu TP.HCM?',
  'Hộp cơm giữ nhiệt Hàn Quốc nào đáng mua?', 'Hộp cơm giữ nhiệt tặng mẹ nên chọn loại nào?', 'Hộp cơm giữ nhiệt loại nào bền nhất, dùng được nhiều năm?',
  'Hộp cơm giữ nhiệt dung tích bao nhiêu là vừa cho một người?', 'Hộp cơm giữ nhiệt nào giữ cơm nóng đến trưa mà không bị nhão?', 'Mua hộp cơm giữ nhiệt ở Thủ Đức ở đâu?',
  'Bộ hộp cơm giữ nhiệt kèm bình canh loại nào tốt?', 'Hộp cơm giữ nhiệt có tay cầm đi dã ngoại loại nào?', 'Hộp cơm giữ nhiệt nào được đánh giá cao trên Tiki, Shopee?',
  'Hộp cơm giữ nhiệt cho học sinh tiểu học loại nào?', 'Hộp cơm giữ nhiệt cắm điện hâm nóng loại nào tốt?', 'Hộp cơm giữ nhiệt loại nào có bảo hành?', 'Hộp cơm giữ nhiệt đẹp làm quà tặng dưới 400k loại nào?',
]
const NOI_CHIEN = [
  'Nồi chiên không dầu loại nào tốt nhất hiện nay?', 'Nên mua nồi chiên không dầu hãng nào ở TP.HCM?', 'Nồi chiên không dầu dưới 2 triệu loại nào tốt?', 'Nồi chiên không dầu cho gia đình 4 người nên mua dung tích bao nhiêu, hãng nào?',
  'Nồi chiên không dầu loại nào bền, ít hỏng?', 'Thương hiệu nồi chiên không dầu uy tín nhất Việt Nam 2026?', 'Nồi chiên không dầu giá rẻ dưới 1 triệu có nên mua không, hãng nào?', 'Nồi chiên không dầu cao cấp trên 3 triệu loại nào đáng tiền?',
  'Nồi chiên không dầu loại nào dễ vệ sinh?', 'Nồi chiên không dầu có lòng nồi không bong tróc chống dính loại nào?', 'Nồi chiên không dầu nào tiết kiệm điện?', 'Nồi chiên không dầu cho người ở một mình loại nhỏ nào tốt?',
  'Nồi chiên không dầu cửa kính nhìn được bên trong loại nào tốt?', 'Nồi chiên không dầu hai ngăn loại nào tốt?', 'Nồi chiên không dầu điện tử hay cơ tốt hơn, nên mua hãng nào?', 'Nồi chiên không dầu loại nào nướng bánh được?',
  'Nồi chiên không dầu nào an toàn, không độc hại khi nấu?', 'Nồi chiên không dầu nào được đánh giá cao trên Shopee, Tiki?', 'Mua nồi chiên không dầu chính hãng ở đâu TP.HCM?', 'Nồi chiên không dầu nào giao hàng trong ngày ở TP.HCM?',
  'Nồi chiên không dầu làm quà tặng tân gia loại nào?', 'Nồi chiên không dầu loại nào có bảo hành dài?', 'Nồi chiên không dầu 5 lít loại nào tốt?', 'Nồi chiên không dầu 7 lít trở lên cho gia đình đông người?',
  'Nồi chiên không dầu Hàn Quốc hay châu Âu tốt hơn?', 'Nồi chiên không dầu nào chạy êm, ít ồn?', 'Nồi chiên không dầu loại nào nấu nhanh?', 'Nồi chiên không dầu có hẹn giờ và giữ ấm loại nào?',
  'Nồi chiên không dầu cho người mới dùng nên chọn loại nào?', 'Nồi chiên không dầu loại nào có nhiều chế độ nấu cài sẵn?', 'Nồi chiên không dầu điều khiển qua điện thoại loại nào?', 'Nồi chiên không dầu inox lòng nồi loại nào tốt?',
  'Mua nồi chiên không dầu ở Thủ Đức ở đâu?', 'Nồi chiên không dầu loại nào bán chạy nhất?', 'Nồi chiên không dầu loại nào phù hợp chung cư nhỏ?', 'Nồi chiên không dầu nào chiên gà giòn ngon?',
  'Nồi chiên không dầu nào được người dùng Việt tin dùng nhiều nhất?', 'So sánh các hãng nồi chiên không dầu phổ biến ở Việt Nam?', 'Nồi chiên không dầu nào đáng tiền nhất trong tầm giá 1 đến 2 triệu?', 'Nồi chiên không dầu loại nào ít mùi nhựa khi dùng lần đầu?',
]
const TEMPLATES = [
  '{c} tốt ở TP.HCM nên mua thương hiệu nào?', 'Mua {c} ở Quận 7 ở đâu?', '{c} giá dưới 300k loại nào tốt?', '{c} nào an toàn cho trẻ em?', '{c} nào bền nhất?',
  'Thương hiệu {c} uy tín nhất Việt Nam 2026?', 'Cửa hàng bán {c} gần Phú Mỹ Hưng?', '{c} nào giao hàng trong ngày ở TP.HCM?', 'Nên mua {c} trên Shopee hay ra cửa hàng?',
  '{c} làm quà tặng nhân viên văn phòng dưới 300k?', '{c} giá rẻ dưới 200k loại nào?', '{c} cao cấp trên 500k có đáng mua không?', 'Mua {c} số lượng lớn cho công ty ở đâu?',
  '{c} nào được đánh giá cao trên Tiki, Shopee?', '{c} chính hãng mua ở đâu TP.HCM?', '{c} nào dễ dùng, dễ vệ sinh?', '{c} nào có bảo hành tốt?', 'Mua {c} ở Thủ Đức ở đâu?',
  '{c} Nhật Bản hay Hàn Quốc tốt hơn?', '{c} nào đáng tiền nhất hiện nay?',
]
export function buildQuestions(category, n = 40) {
  const key = (category || '').toLowerCase()
  const list = /hộp cơm|cặp lồng|giữ nhiệt/.test(key) ? HOP_COM : /nồi chiên/.test(key) ? NOI_CHIEN : TEMPLATES.map((t) => t.replace(/\{c\}/g, category || 'sản phẩm'))
  return list.slice(0, n)
}
