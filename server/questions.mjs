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
const TEMPLATES = [
  '{c} tốt ở TP.HCM nên mua thương hiệu nào?', 'Mua {c} ở Quận 7 ở đâu?', '{c} giá dưới 300k loại nào tốt?', '{c} nào an toàn cho trẻ em?', '{c} nào bền nhất?',
  'Thương hiệu {c} uy tín nhất Việt Nam 2026?', 'Cửa hàng bán {c} gần Phú Mỹ Hưng?', '{c} nào giao hàng trong ngày ở TP.HCM?', 'Nên mua {c} trên Shopee hay ra cửa hàng?',
  '{c} làm quà tặng nhân viên văn phòng dưới 300k?', '{c} giá rẻ dưới 200k loại nào?', '{c} cao cấp trên 500k có đáng mua không?', 'Mua {c} số lượng lớn cho công ty ở đâu?',
  '{c} nào được đánh giá cao trên Tiki, Shopee?', '{c} chính hãng mua ở đâu TP.HCM?', '{c} nào dễ dùng, dễ vệ sinh?', '{c} nào có bảo hành tốt?', 'Mua {c} ở Thủ Đức ở đâu?',
  '{c} Nhật Bản hay Hàn Quốc tốt hơn?', '{c} nào đáng tiền nhất hiện nay?',
]
export function buildQuestions(category, n = 40) {
  const key = (category || '').toLowerCase()
  const list = /hộp cơm|cặp lồng|giữ nhiệt/.test(key) ? HOP_COM : TEMPLATES.map((t) => t.replace(/\{c\}/g, category || 'sản phẩm'))
  return list.slice(0, n)
}
