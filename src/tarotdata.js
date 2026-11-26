import { getLang } from './i18n.js';

/**
 * The full 78-card Rider-Waite-Smith deck (Pamela Colman Smith, 1909: public domain). The images are in public/tarot/<id>.jpg,
 * fetched from Wikimedia Commons. Ids: m00..m21 = Major Arcana, w/c/s/p + 01..14 = Wands, Cups, Swords, Pentacles
 * (01 = Ace, 11 = Page, 12 = Knight, 13 = Queen, 14 = King). Each card has a short, gentle meaning in Vietnamese and English.
 */
const MAJOR = [
  ['The Fool', 'Chàng Ngốc'], ['The Magician', 'Nhà Ảo Thuật'], ['The High Priestess', 'Nữ Tư Tế'], ['The Empress', 'Hoàng Hậu'], ['The Emperor', 'Hoàng Đế'], ['The Hierophant', 'Giáo Hoàng'],
  ['The Lovers', 'Đôi Tình Nhân'], ['The Chariot', 'Cỗ Xe'], ['Strength', 'Sức Mạnh'], ['The Hermit', 'Ẩn Sĩ'], ['Wheel of Fortune', 'Bánh Xe Vận Mệnh'], ['Justice', 'Công Lý'],
  ['The Hanged Man', 'Người Treo Ngược'], ['Death', 'Cái Chết'], ['Temperance', 'Tiết Chế'], ['The Devil', 'Ác Quỷ'], ['The Tower', 'Tòa Tháp'], ['The Star', 'Ngôi Sao'],
  ['The Moon', 'Mặt Trăng'], ['The Sun', 'Mặt Trời'], ['Judgement', 'Phán Xét'], ['The World', 'Thế Giới'],
];
const SUITS = { w: ['Wands', 'Gậy'], c: ['Cups', 'Cốc'], s: ['Swords', 'Kiếm'], p: ['Pentacles', 'Tiền'] };
const RANKS = [['Ace', 'Át'], ['Two', 'Hai'], ['Three', 'Ba'], ['Four', 'Bốn'], ['Five', 'Năm'], ['Six', 'Sáu'], ['Seven', 'Bảy'], ['Eight', 'Tám'], ['Nine', 'Chín'], ['Ten', 'Mười'], ['Page', 'Thị Đồng'], ['Knight', 'Hiệp Sĩ'], ['Queen', 'Hoàng Hậu'], ['King', 'Vua']];

const MEANING = {
  m00: ['Khởi đầu mới đầy hồn nhiên. Hãy mạnh dạn bước tiếp, đừng sợ vấp.', 'A fresh, carefree start. Step forward boldly and do not fear a stumble.'],
  m01: ['Bạn đã có đủ mọi thứ trong tay. Biến ý tưởng thành việc làm ngay hôm nay.', 'You already hold everything you need. Turn an idea into action today.'],
  m02: ['Hãy lắng nghe trực giác. Có điều chưa nói ra đang chờ bạn nhận ra.', 'Listen to your intuition. Something unspoken is waiting for you to notice.'],
  m03: ['Sự dồi dào, nuôi dưỡng và chăm sóc. Dành thời gian cho người thân và những bữa ăn ấm cúng.', 'Abundance, nurture and care. Make time for loved ones and warm meals.'],
  m04: ['Trật tự, vững vàng và trách nhiệm. Đặt ra giới hạn rõ ràng sẽ giúp bạn an tâm hơn.', 'Order, stability and responsibility. Clear boundaries will give you peace of mind.'],
  m05: ['Truyền thống và lời khuyên của người đi trước. Một nếp quen thuộc mang lại cảm giác thuộc về.', 'Tradition and the advice of those who came before. A familiar custom brings a sense of belonging.'],
  m06: ['Một mối liên kết đẹp hoặc một lựa chọn từ trái tim. Hãy đáp lại bằng sự chân thành.', 'A lovely bond or a choice from the heart. Answer it with sincerity.'],
  m07: ['Quyết tâm đưa bạn tới đích. Giữ vững hướng đi và tin vào nỗ lực của mình.', 'Determination carries you to the finish. Hold your course and trust your effort.'],
  m08: ['Sức mạnh dịu dàng của sự kiên nhẫn. Bạn thắng bằng sự điềm tĩnh chứ không phải sự cứng rắn.', 'The gentle strength of patience. You win through calm, not through force.'],
  m09: ['Một khoảng lặng để nhìn lại. Một ngọn nến nhỏ cũng đủ soi đường.', 'A quiet pause to look back. A small candle is enough to light the way.'],
  m10: ['Vòng quay thay đổi, may mắn đang xoay về phía bạn. Hãy sẵn sàng đón cơ hội.', 'The wheel turns and luck is swinging your way. Be ready to catch the chance.'],
  m11: ['Công bằng và sự thật. Mọi việc rồi sẽ rõ ràng, hãy chọn điều đúng đắn.', 'Fairness and truth. Things will become clear, so choose what is right.'],
  m12: ['Tạm dừng và nhìn bằng một góc khác. Chờ đợi lúc này không phải là lãng phí.', 'Pause and look from another angle. Waiting now is not wasted time.'],
  m13: ['Không phải kết thúc đáng sợ, mà là khép lại một chương cũ để chương mới mở ra. Hãy buông điều đã cũ.', 'Not a frightening end, but an old chapter closing so a new one can open. Let go of what is worn out.'],
  m14: ['Cân bằng và điều độ. Pha trộn mọi thứ vừa phải, đừng vội vàng.', 'Balance and moderation. Blend things in measure and do not rush.'],
  m15: ['Một thói quen hay ràng buộc đang giữ chân bạn. Nhận ra nó là bước đầu để tự do.', 'A habit or attachment is holding you back. Noticing it is the first step to freedom.'],
  m16: ['Một thay đổi bất ngờ làm lung lay điều cũ. Hơi đau nhưng mở đường cho nền móng vững hơn.', 'A sudden change shakes what was old. It stings a little but clears the way for firmer foundations.'],
  m17: ['Hy vọng và chữa lành. Điều ước bạn gửi lên ngôi sao đang được lắng nghe.', 'Hope and healing. The wish you sent to the stars is being heard.'],
  m18: ['Mọi thứ chưa rõ ràng lắm. Đừng vội kết luận, hãy chờ trời sáng.', 'Things are not quite clear yet. Do not rush to conclusions, wait for daylight.'],
  m19: ['Niềm vui, thành công và năng lượng tràn đầy. Hãy chia sẻ nụ cười với mọi người.', 'Joy, success and plenty of energy. Share your smile with everyone.'],
  m20: ['Một tiếng gọi thức tỉnh. Nhìn lại, tha thứ và bước sang giai đoạn mới nhẹ lòng hơn.', 'A wake-up call. Look back, forgive and step into a lighter new phase.'],
  m21: ['Một chặng đường hoàn thành. Bạn đáng được ăn mừng, và một chương mới sắp mở ra.', 'A journey completed. You deserve a celebration, and a new chapter is about to open.'],

  w01: ['Một tia lửa ý tưởng mới. Hãy bắt đầu khi hứng khởi còn nóng.', 'A new spark of an idea. Start while the enthusiasm is warm.'],
  w02: ['Đứng trước ngã rẽ, bạn đang cân nhắc một tầm nhìn xa hơn. Hãy lập kế hoạch trước khi bước ra.', 'At a crossroads, you weigh a bigger vision. Plan before you step out.'],
  w03: ['Công sức bắt đầu có kết quả, tàu hàng đang cập bến. Hãy kiên nhẫn chờ thêm một chút.', 'Your effort is starting to pay off and your ships are coming in. Wait a little longer.'],
  w04: ['Ăn mừng và sum họp. Một dịp vui trong nhà hoặc với bạn bè đang đến.', 'Celebration and togetherness. A happy gathering at home or with friends is coming.'],
  w05: ['Va chạm và tranh cãi nhỏ. Mỗi người một ý, hãy thi đua vui vẻ và đừng gay gắt.', 'Friction and small clashes. Everyone has an opinion, so compete in good humour.'],
  w06: ['Chiến thắng và được công nhận. Hãy tự hào về bước tiến của mình.', 'Victory and recognition. Be proud of how far you have come.'],
  w07: ['Bạn đang bảo vệ vị trí của mình. Giữ vững lập trường, bạn mạnh hơn bạn nghĩ.', 'You are defending your ground. Hold your position, you are stronger than you think.'],
  w08: ['Mọi việc diễn ra nhanh chóng. Tin nhắn và tin vui sắp đến dồn dập.', 'Things move fast. Messages and good news arrive in quick succession.'],
  w09: ['Mệt nhưng bạn vẫn đứng vững. Còn một chút nữa thôi, đừng bỏ cuộc.', 'Tired, yet still standing. Just a little further, do not give up.'],
  w10: ['Gánh nặng đang đè lên vai. Hãy nhờ người khác chia bớt việc.', 'A heavy load rests on your shoulders. Ask others to share it.'],
  w11: ['Một tin vui hoặc một đam mê mới còn non trẻ. Cứ tò mò và thử sức.', 'Good news or a young new passion. Be curious and give it a try.'],
  w12: ['Đầy nhiệt huyết và hành động nhanh. Cẩn thận đừng lao đi quá vội.', 'Full of energy and quick to act. Take care not to rush ahead.'],
  w13: ['Ấm áp, tự tin và cuốn hút. Bạn toả sáng khi làm điều mình yêu.', 'Warm, confident and charming. You shine when you do what you love.'],
  w14: ['Người dẫn dắt có tầm nhìn. Hãy tin vào ý tưởng lớn và truyền cảm hứng cho người khác.', 'A visionary leader. Trust the big idea and inspire others.'],

  c01: ['Một dòng cảm xúc mới: tình yêu, lòng biết ơn hoặc sự sáng tạo đang tràn đầy.', 'A new wave of feeling: love, gratitude or creativity is overflowing.'],
  c02: ['Sự gắn kết và thấu hiểu giữa hai người. Một tình bạn hoặc mối quan hệ đẹp.', 'Connection and understanding between two people. A lovely friendship or relationship.'],
  c03: ['Vui vẻ bên bạn bè. Hãy nâng ly cùng những người bạn quý.', 'Joy with friends. Raise a glass with the people you cherish.'],
  c04: ['Bạn đang chán hoặc lơ đãng, dễ bỏ lỡ điều được trao. Hãy ngẩng lên nhìn xung quanh.', 'You feel bored or distracted and may miss what is offered. Look up and around you.'],
  c05: ['Tiếc nuối điều đã mất. Nhưng vẫn còn hai chiếc cốc đứng vững phía sau bạn.', 'Regret over what was lost. Yet two cups still stand behind you.'],
  c06: ['Ký ức tuổi thơ và những món quà giản dị. Một người xưa hoặc kỷ niệm đẹp trở lại.', 'Childhood memories and simple gifts. An old friend or a fond memory returns.'],
  c07: ['Quá nhiều lựa chọn lung linh. Hãy phân biệt điều thật với ảo tưởng.', 'Too many glittering options. Tell the real from the daydream.'],
  c08: ['Rời bỏ điều không còn làm bạn hạnh phúc để đi tìm điều ý nghĩa hơn.', 'Walk away from what no longer makes you happy to look for something more meaningful.'],
  c09: ['Điều ước thành sự thật, bạn cảm thấy mãn nguyện. Hãy tận hưởng niềm vui của mình.', 'Wishes come true and you feel content. Enjoy your happiness.'],
  c10: ['Hạnh phúc gia đình trọn vẹn. Một mái ấm yêu thương và những khoảnh khắc đáng nhớ.', 'Complete family happiness. A loving home and moments worth remembering.'],
  c11: ['Một tin nhắn dịu dàng hoặc ý tưởng sáng tạo bất ngờ. Hãy mở lòng đón nhận.', 'A gentle message or a surprising creative idea. Open your heart to it.'],
  c12: ['Lãng mạn và đầy mơ mộng. Một lời mời hoặc món quà đến từ trái tim.', 'Romantic and dreamy. An invitation or gift comes from the heart.'],
  c13: ['Dịu dàng, thấu cảm và trực giác tốt. Hãy chăm sóc cảm xúc của mình và của người khác.', "Gentle, empathetic and intuitive. Look after your feelings and other people's."],
  c14: ['Điềm tĩnh và trưởng thành trong cảm xúc. Bạn biết lắng nghe và giữ thăng bằng.', 'Calm and emotionally mature. You know how to listen and keep your balance.'],

  s01: ['Một ý nghĩ sáng rõ, sự thật được nói ra. Hãy quyết định bằng cái đầu tỉnh táo.', 'A clear thought and the truth spoken. Decide with a clear head.'],
  s02: ['Bế tắc vì chưa muốn chọn. Hãy gỡ băng che mắt và nhìn thẳng vào điều đang né tránh.', 'A stalemate where you avoid choosing. Take off the blindfold and face what you avoid.'],
  s03: ['Nỗi buồn hay lời nói làm tổn thương. Hãy cho phép mình buồn rồi chữa lành.', 'Sadness or hurtful words. Allow yourself to grieve, then heal.'],
  s04: ['Cần nghỉ ngơi và hồi phục. Một khoảng yên tĩnh trước khi đi tiếp.', 'Time to rest and recover. A quiet pause before moving on.'],
  s05: ['Thắng trong tranh cãi nhưng cái giá có thể cao. Hãy chọn trận nào đáng đánh.', 'Winning an argument may cost more than it is worth. Pick your battles.'],
  s06: ['Rời xa sóng gió để tới vùng nước êm hơn. Một chuyến đi hoặc sự chuyển biến nhẹ nhàng.', 'Leaving rough waters for calmer ones. A journey or a gentle transition.'],
  s07: ['Có người, hoặc chính bạn, đang đi đường tắt. Cẩn trọng và nói thật sẽ có lợi hơn.', 'Someone, maybe you, is taking a shortcut. Care and honesty pay off better.'],
  s08: ['Cảm giác bị trói buộc, nhưng dây trói lỏng hơn bạn tưởng. Bạn có thể bước ra.', 'Feeling trapped, yet the ropes are looser than you think. You can step out.'],
  s09: ['Lo lắng khiến đêm dài hơn thực tế. Hãy kể với ai đó, nỗi sợ sẽ nhỏ lại.', 'Worry makes the night longer than it is. Tell someone and the fear will shrink.'],
  s10: ['Một chặng khó khăn đã chạm đáy và sắp kết thúc. Bình minh đang ở phía chân trời.', 'A hard stretch has hit bottom and is about to end. Dawn is on the horizon.'],
  s11: ['Tò mò, nhanh trí và thích học hỏi. Hãy đặt câu hỏi và lắng nghe.', 'Curious, quick-witted and eager to learn. Ask questions and listen.'],
  s12: ['Thẳng thắn và hành động nhanh. Hãy nói điều cần nói, nhưng nhẹ nhàng thôi.', 'Direct and quick to act. Say what needs saying, but gently.'],
  s13: ['Sáng suốt, độc lập và công bằng. Bạn nhìn rõ sự thật và nói thẳng một cách tử tế.', 'Sharp, independent and fair. You see the truth and say it kindly.'],
  s14: ['Trí tuệ và quyết định có lý lẽ. Hãy dùng sự công tâm để dẫn dắt.', 'Intellect and reasoned decisions. Lead with fairness.'],

  p01: ['Một cơ hội cụ thể về công việc, tiền bạc hoặc sức khoẻ. Hãy gieo hạt ngay.', 'A tangible chance in work, money or health. Plant the seed now.'],
  p02: ['Khéo léo cân bằng nhiều việc cùng lúc. Linh hoạt sẽ giúp bạn không kiệt sức.', 'Juggling several things with skill. Staying flexible keeps you from burning out.'],
  p03: ['Làm việc nhóm và tay nghề được ghi nhận. Cùng nhau bạn làm nên điều đẹp.', 'Teamwork and craftsmanship recognised. Together you build something fine.'],
  p04: ['Giữ chặt tiền bạc và sự an toàn. Vững vàng là tốt, nhưng đừng giữ chặt đến mức không chia sẻ được.', 'Holding tight to money and security. Stability is good, but do not clutch so hard you cannot share.'],
  p05: ['Thiếu thốn và cảm giác bị bỏ ngoài cửa. Hãy tìm sự giúp đỡ, ánh đèn ấm đang ở ngay bên cạnh.', 'Hardship and feeling left out in the cold. Seek help, a warm light is close by.'],
  p06: ['Cho và nhận cân bằng. Sự hào phóng của bạn sẽ quay trở lại.', 'Giving and receiving in balance. Your generosity returns to you.'],
  p07: ['Chờ đến mùa gặt. Công sức đã bỏ ra cần thêm thời gian để chín.', 'Waiting for the harvest. Your effort needs more time to ripen.'],
  p08: ['Chăm chỉ rèn tay nghề. Sự tỉ mỉ hôm nay là nền cho thành công mai sau.', "Diligent practice of your craft. Today's care builds tomorrow's success."],
  p09: ['Sung túc nhờ nỗ lực của chính mình. Hãy tận hưởng thành quả một cách thư thái.', 'Comfort earned through your own effort. Enjoy the fruits at your ease.'],
  p10: ['Gia đình, di sản và sự ổn định lâu dài. Một mái nhà đầy ắp tiếng cười.', 'Family, heritage and lasting stability. A home full of laughter.'],
  p11: ['Một cơ hội học hỏi hoặc mục tiêu mới đầy thực tế. Hãy bắt đầu từng bước nhỏ.', 'A chance to learn or a practical new goal. Start with small steps.'],
  p12: ['Chậm mà chắc. Kiên trì và đáng tin cậy sẽ đưa bạn đi xa.', 'Slow and steady. Persistence and reliability take you far.'],
  p13: ['Chu đáo, thực tế và biết chăm lo. Nơi ấm áp bạn tạo ra làm mọi người dễ chịu.', 'Caring, practical and nurturing. The warm place you make comforts everyone.'],
  p14: ['Vững vàng, thành đạt và hào phóng. Bạn xây nên một nền tảng ai cũng có thể tin cậy.', 'Steady, accomplished and generous. You build a foundation others can trust.'],
};

/** All 78 cards: { id, kind ('m' major, or the suit letter w/c/s/p), img } */
export const DECK = [
  ...MAJOR.map((_, i) => ({ id: `m${String(i).padStart(2, '0')}`, kind: 'm' })),
  ...Object.keys(SUITS).flatMap((s) => RANKS.map((_, i) => ({ id: `${s}${String(i + 1).padStart(2, '0')}`, kind: s }))),
].map((c) => ({ ...c, img: `/tarot/${c.id}.jpg` }));

const L = () => (getLang() === 'vi' ? 1 : 0); // index into the [en, vi] pairs
export function cardName(id) {
  if (id[0] === 'm') return MAJOR[+id.slice(1)][L()];
  const [suit, rank] = [SUITS[id[0]], RANKS[+id.slice(1) - 1]];
  return L() ? `${rank[1]} ${suit[1]}` : `${rank[0]} of ${suit[0]}`;
}
export const cardMeaning = (id) => MEANING[id][getLang() === 'vi' ? 0 : 1];
