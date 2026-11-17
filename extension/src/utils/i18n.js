// src/utils/i18n.js
// ScanCart in 3 languages: English (main), Hindi (हिन्दी) and Hinglish. One setting (`scLang` in
// chrome.storage.local) for the page panel, the toolbar popup and the phone apps.
// How it works: ScanCart's own words are translated after they are drawn (exact phrases, then
// patterns with numbers, then " · "-separated parts). Shop text — product names, buyers' review
// quotes, seller names — is never touched.

const KEY = 'scLang'
export const LANGS = [['en', 'EN'], ['hi', 'हि'], ['hinglish', 'Hinglish']]
const store = () => globalThis.chrome?.storage?.local || null

export async function getLang() {
  try { const v = (await store()?.get(KEY))?.[KEY]; return v === 'hi' || v === 'hinglish' ? v : 'en' } catch { return 'en' }
}
const _listeners = new Set()
let _wired = false
export async function setLang(v) {
  try { await store()?.set({ [KEY]: v }) } catch {}
  _listeners.forEach(fn => { try { fn(v) } catch {} })
}
export function onLangChange(fn) {
  _listeners.add(fn)
  if (!_wired) {
    _wired = true
    try { globalThis.chrome?.storage?.onChanged?.addListener((ch, area) => { if (area === 'local' && ch[KEY]) _listeners.forEach(f => f(ch[KEY].newValue || 'en')) }) } catch {}
  }
  return () => _listeners.delete(fn)
}

// ── Exact phrases: English → [Hindi, Hinglish] ──
const W = {
  // header, tabs, strip, button
  'Overview': ['सारांश', 'Overview'], 'Reviews': ['रिव्यू', 'Reviews'], 'Seller': ['विक्रेता', 'Seller'], 'Price': ['कीमत', 'Price'],
  'Where to buy': ['कहाँ से खरीदें', 'Kahan se khareeden'], 'Share': ['शेयर', 'Share'], '✓ Copied': ['✓ कॉपी हो गया', '✓ Copy ho gaya'],
  'Safe to buy': ['खरीदने के लिए सुरक्षित', 'Kharidne ke liye safe'], 'Buy with caution': ['सावधानी से खरीदें', 'Dhyan se khareeden'],
  'Do not buy': ['न खरीदें', 'Mat khareedo'], 'Sale looks fake': ['सेल नकली लगती है', 'Sale nakli lagti hai'],
  'Scan with ScanCart': ['ScanCart से जाँचें', 'ScanCart se check karo'], 'ScanCart · checking…': ['ScanCart · जाँच हो रही है…', 'ScanCart · check ho raha hai…'],
  'QUICK': ['झटपट', 'QUICK'], 'Quick check from page data · pick a check below': ['पेज की जानकारी से झटपट जाँच · नीचे कोई जाँच चुनें', 'Page ke data se quick check · neeche koi check chuno'],
  'Dark mode': ['डार्क मोड', 'Dark mode'], 'Switch to dark mode': ['डार्क मोड चालू करें', 'Dark mode on karo'], 'Switch to light mode': ['लाइट मोड चालू करें', 'Light mode on karo'],
  // options menu + scanning
  'What do you want to check?': ['आप क्या जाँचना चाहते हैं?', 'Aap kya check karna chahte ho?'],
  'Is it safe to buy?': ['क्या खरीदना सुरक्षित है?', 'Kya kharidna safe hai?'], 'Trust score + top reasons': ['ट्रस्ट स्कोर + मुख्य कारण', 'Trust score + main reasons'],
  'Real vs fake + what buyers say': ['असली बनाम नकली + खरीदार क्या कहते हैं', 'Asli vs nakli + buyers kya kehte hain'],
  'Seller trust': ['विक्रेता पर भरोसा', 'Seller pe bharosa'], 'Seller history and trust tier': ['विक्रेता का इतिहास और भरोसा स्तर', 'Seller ki history aur trust level'],
  'Real price & discount': ['असली कीमत और छूट', 'Asli price aur discount'], 'Fake sale check, price on other stores': ['नकली सेल की जाँच, दूसरे स्टोर पर कीमत', 'Fake sale check, doosre stores pe price'],
  'Where to buy & alternatives': ['कहाँ से खरीदें और विकल्प', 'Kahan se khareeden aur alternatives'], 'Trusted stores rated · similar products': ['भरोसेमंद स्टोर की रेटिंग · मिलते-जुलते प्रोडक्ट', 'Trusted stores ki rating · milte-julte products'],
  'Analyzing…': ['जाँच हो रही है…', 'Check ho raha hai…'], '6 AI checks running in parallel': ['6 जाँचें एक साथ चल रही हैं', '6 checks ek saath chal rahe hain'],
  'Looking up live listings (10–30 s)': ['लाइव लिस्टिंग खोज रहे हैं (10–30 सेकंड)', 'Live listings dhoondh rahe hain (10–30 sec)'],
  'Reading review texts…': ['रिव्यू पढ़ रहे हैं…', 'Reviews padh rahe hain…'], 'Checking rating vs review counts…': ['रेटिंग और रिव्यू की गिनती मिला रहे हैं…', 'Rating aur review count mila rahe hain…'],
  'Looking for copy-paste reviews…': ['कॉपी-पेस्ट रिव्यू ढूँढ रहे हैं…', 'Copy-paste reviews dhoondh rahe hain…'], 'Scoring authenticity…': ['असलियत का स्कोर बना रहे हैं…', 'Asliyat ka score bana rahe hain…'],
  'Reading this price and MRP…': ['कीमत और MRP पढ़ रहे हैं…', 'Price aur MRP padh rahe hain…'], 'Checking ScanCart price history…': ['कीमत का इतिहास देख रहे हैं…', 'Price history dekh rahe hain…'],
  'Searching similar products…': ['मिलते-जुलते प्रोडक्ट खोज रहे हैं…', 'Similar products dhoondh rahe hain…'], 'Finding best deal…': ['सबसे अच्छी डील ढूँढ रहे हैं…', 'Best deal dhoondh rahe hain…'],
  'Reading seller details…': ['विक्रेता की जानकारी पढ़ रहे हैं…', 'Seller details padh rahe hain…'], 'Checking seller profile…': ['विक्रेता की प्रोफ़ाइल देख रहे हैं…', 'Seller profile dekh rahe hain…'],
  'Checking listing details…': ['लिस्टिंग की जानकारी देख रहे हैं…', 'Listing details dekh rahe hain…'], 'Computing trust…': ['भरोसा माप रहे हैं…', 'Trust calculate kar rahe hain…'],
  'Running 6 checks…': ['6 जाँचें चल रही हैं…', '6 checks chal rahe hain…'], 'Aggregating findings…': ['नतीजे जोड़ रहे हैं…', 'Results jod rahe hain…'],
  'Computing trust score…': ['ट्रस्ट स्कोर बना रहे हैं…', 'Trust score bana rahe hain…'], 'Writing recommendation…': ['सलाह लिख रहे हैं…', 'Salah likh rahe hain…'],
  'Loading the reviews on this page…': ['इस पेज के रिव्यू खोल रहे हैं…', 'Is page ke reviews khol rahe hain…'], 'Reading review pages…': ['रिव्यू के पेज पढ़ रहे हैं…', 'Review pages padh rahe hain…'],
  'Analysis failed. Check your connection.': ['जाँच नहीं हो सकी। इंटरनेट कनेक्शन देखें।', 'Check nahi ho paya. Internet connection dekho.'], 'Back': ['वापस', 'Wapas'],
  // reviews
  'Real vs fake · what buyers say': ['असली बनाम नकली · खरीदार क्या कहते हैं', 'Asli vs nakli · buyers kya kehte hain'],
  'Reviews ScanCart read': ['ScanCart ने ये रिव्यू पढ़े', 'ScanCart ne ye reviews padhe'], 'no review text found': ['कोई रिव्यू नहीं मिला', 'koi review nahi mila'],
  'from this page only': ['सिर्फ़ इसी पेज से', 'sirf isi page se'], 'LOW RISK': ['कम जोखिम', 'LOW RISK'], 'MEDIUM': ['मध्यम', 'MEDIUM'], 'HIGH RISK': ['ज़्यादा जोखिम', 'HIGH RISK'], 'N/A': ['लागू नहीं', 'N/A'],
  'Reading extra review pages: On · turn off': ['ज़्यादा रिव्यू पेज पढ़ना: चालू · बंद करें', 'Extra review pages padhna: On · band karo'],
  'Reading extra review pages: Off · turn on': ['ज़्यादा रिव्यू पेज पढ़ना: बंद · चालू करें', 'Extra review pages padhna: Off · chalu karo'],
  'Reading extra review pages is off': ['ज़्यादा रिव्यू पेज पढ़ना बंद है', 'Extra review pages padhna band hai'],
  'This shop shows its reviews on the product page': ['यह दुकान रिव्यू प्रोडक्ट पेज पर ही दिखाती है', 'Ye shop reviews product page pe hi dikhati hai'],
  "No reviews found on this shop's page": ['इस दुकान के पेज पर कोई रिव्यू नहीं मिला', 'Is shop ke page pe koi review nahi mila'],
  'Sign in to the store to read more review pages': ['ज़्यादा रिव्यू पढ़ने के लिए स्टोर में साइन इन करें', 'Zyada reviews ke liye store mein sign in karo'],
  'Review pages had no readable reviews': ['रिव्यू पेज पर पढ़ने लायक रिव्यू नहीं मिले', 'Review pages pe padhne layak reviews nahi mile'],
  'Review pages could not be opened': ['रिव्यू पेज नहीं खुल सके', 'Review pages nahi khul paaye'],
  'Real reviews — read these': ['असली रिव्यू — इन्हें पढ़ें', 'Asli reviews — inhe padho'], 'Flagged as fake': ['नकली माने गए', 'Nakli maane gaye'],
  'Too short to judge': ['बहुत छोटे, परख नहीं सकते', 'Bahut chhote, judge nahi kar sakte'], 'FEW': ['कम', 'FEW'], 'STRONG': ['पक्का', 'STRONG'],
  'What ScanCart found · basic check (no AI)': ['ScanCart को क्या मिला · बुनियादी जाँच (बिना AI)', 'ScanCart ko kya mila · basic check (bina AI)'],
  'What the AI found': ['AI को क्या मिला', 'AI ko kya mila'],
  'Reviews look genuine — rating looks trustworthy': ['रिव्यू असली लगते हैं — रेटिंग पर भरोसा कर सकते हैं', 'Reviews asli lagte hain — rating pe bharosa kar sakte ho'],
  'Partly inflated — trust the real reviews above': ['कुछ बढ़ा-चढ़ाकर — ऊपर के असली रिव्यू पर भरोसा करें', 'Thoda badha-chadha ke — upar ke asli reviews pe bharosa karo'],
  'Reviews unreliable — do not trust the star rating': ['रिव्यू भरोसे लायक नहीं — स्टार रेटिंग पर भरोसा न करें', 'Reviews bharose layak nahi — star rating pe bharosa mat karo'],
  'The rating-pattern check could not run for this scan, so it was left out of the Trust Score.': ['इस बार रेटिंग की जाँच नहीं हो सकी, इसलिए इसे ट्रस्ट स्कोर में नहीं जोड़ा गया।', 'Is baar rating ka check nahi ho paya, isliye Trust Score mein nahi joda.'],
  'Not enough reviews yet': ['अभी काफ़ी रिव्यू नहीं हैं', 'Abhi kaafi reviews nahi hain'],
  'We show a topic only when 3 or more real reviews give an opinion on it.': ['कोई विषय तभी दिखाते हैं जब 3 या ज़्यादा असली रिव्यू उस पर राय दें।', 'Topic tabhi dikhate hain jab 3 ya zyada asli reviews us pe raay dein.'],
  '← Reviews': ['← रिव्यू', '← Reviews'], 'Bad': ['खराब', 'Kharab'], 'Mixed': ['मिली-जुली', 'Mixed'], 'Good': ['अच्छा', 'Achha'],
  'Real-looking review': ['असली लगने वाला रिव्यू', 'Asli lagne wala review'], 'Only reviews that passed the fake check are listed here.': ['यहाँ सिर्फ़ वही रिव्यू हैं जो नकली-जाँच में पास हुए।', 'Yahan sirf wahi reviews hain jo fake check mein pass hue.'],
  "The store's own summary of every review. Not checked for fakes.": ['सभी रिव्यू का स्टोर का अपना सारांश। नकली के लिए जाँचा नहीं गया।', 'Store ka apna summary sab reviews ka. Fake ke liye check nahi kiya.'],
  // review topics + categories
  'Matches photo?': ['फ़ोटो जैसा है?', 'Photo jaisa hai?'], 'Genuine product?': ['असली प्रोडक्ट?', 'Asli product?'], 'Delivery & box': ['डिलीवरी और डिब्बा', 'Delivery aur box'],
  'Value for money': ['पैसा वसूल', 'Paisa vasool'], 'Material': ['कपड़ा/मटीरियल', 'Material'], 'Fit & size': ['फ़िटिंग और साइज़', 'Fitting aur size'], 'Colour': ['रंग', 'Rang'],
  'Stitching': ['सिलाई', 'Silai'], 'After wash': ['धुलाई के बाद', 'Dhulai ke baad'], 'Comfort': ['आराम', 'Aaram'], 'Sole & grip': ['सोल और पकड़', 'Sole aur grip'],
  'Durability': ['टिकाऊपन', 'Tikaau-pan'], 'Battery': ['बैटरी', 'Battery'], 'Sound / screen': ['आवाज़ / स्क्रीन', 'Awaaz / screen'], 'Build quality': ['बनावट', 'Build quality'],
  'Charging': ['चार्जिंग', 'Charging'], 'Heating': ['गर्म होना', 'Garam hona'], 'Connection': ['कनेक्शन', 'Connection'], 'Warranty & service': ['वारंटी और सर्विस', 'Warranty aur service'],
  'Size': ['साइज़', 'Size'], 'Ease of use': ['इस्तेमाल में आसानी', 'Use karna aasaan'], 'Cleaning': ['सफ़ाई', 'Safai'], 'Skin reaction': ['त्वचा पर असर', 'Skin pe reaction'],
  'Results': ['नतीजे', 'Results'], 'Smell': ['खुशबू', 'Khushboo'], 'Texture': ['बनावट', 'Texture'], 'Freshness / expiry': ['ताज़गी / एक्सपायरी', 'Freshness / expiry'],
  'Taste': ['स्वाद', 'Swaad'], 'Packing': ['पैकिंग', 'Packing'], 'Quantity': ['मात्रा', 'Quantity'], 'Quality': ['क्वालिटी', 'Quality'], 'Fit': ['फ़िटिंग', 'Fitting'],
  'Clothing': ['कपड़े', 'Kapde'], 'Footwear': ['जूते-चप्पल', 'Joote-chappal'], 'Electronics': ['इलेक्ट्रॉनिक्स', 'Electronics'], 'Home & kitchen': ['घर और रसोई', 'Ghar aur kitchen'],
  'Beauty & skincare': ['ब्यूटी और स्किनकेयर', 'Beauty aur skincare'], 'Food & grocery': ['खाना और किराना', 'Khana aur kirana'], 'Other': ['अन्य', 'Other'],
  // price
  'Price history': ['कीमत का इतिहास', 'Price history'], 'Price range': ['कीमत की रेंज', 'Price range'], 'Today': ['आज', 'Aaj'], 'Lowest': ['सबसे कम', 'Sabse kam'],
  'Lowest so far': ['अब तक सबसे कम', 'Ab tak sabse kam'], 'price': ['कीमत', 'price'], 'average': ['औसत', 'average'], 'today': ['आज', 'aaj'],
  'Price history is just starting.': ['कीमत का इतिहास अभी शुरू हुआ है।', 'Price history abhi shuru hui hai.'],
  'ScanCart has not seen this listing often enough yet to judge the discount.': ['ScanCart ने यह लिस्टिंग अभी इतनी बार नहीं देखी कि छूट परख सके।', 'ScanCart ne ye listing abhi itni baar nahi dekhi ki discount judge kar sake.'],
  'Usual price.': ['सामान्य कीमत।', 'Normal price.'], 'Real deal: lowest price seen.': ['असली डील: अब तक की सबसे कम कीमत।', 'Asli deal: ab tak ka sabse kam price.'],
  'Sale looks fake.': ['सेल नकली लगती है।', 'Sale nakli lagti hai.'], 'Higher than usual.': ['सामान्य से ज़्यादा।', 'Normal se zyada.'],
  'Watch this price': ['इस कीमत पर नज़र रखें', 'Is price pe nazar rakho'], 'Watch': ['नज़र रखें', 'Watch karo'], 'Stop watching': ['नज़र रखना बंद करें', 'Watch band karo'],
  'Saving…': ['सेव हो रहा है…', 'Save ho raha hai…'], 'Try again': ['फिर कोशिश करें', 'Phir try karo'],
  'ScanCart checks this page every 6 hours and sends a Chrome notification when the price drops or reaches your target.': ['ScanCart हर 6 घंटे में यह पेज देखता है और कीमत गिरने या आपके टारगेट तक पहुँचने पर Chrome नोटिफ़िकेशन भेजता है।', 'ScanCart har 6 ghante mein ye page check karta hai aur price girne ya target tak aane pe Chrome notification bhejta hai.'],
  'ScanCart checks this page every 6 hours and sends a phone notification when the price drops or reaches your target.': ['ScanCart हर 6 घंटे में यह पेज देखता है और कीमत गिरने या आपके टारगेट तक पहुँचने पर फ़ोन पर नोटिफ़िकेशन भेजता है।', 'ScanCart har 6 ghante mein ye page check karta hai aur price girne ya target tak aane pe phone notification bhejta hai.'],
  'Alert me at (optional)': ['इस कीमत पर बताएं (वैकल्पिक)', 'Is price pe batao (optional)'],
  'Price check': ['कीमत की जाँच', 'Price check'], 'This price vs similar products': ['यह कीमत बनाम मिलते-जुलते प्रोडक्ट', 'Ye price vs similar products'],
  'NO CHEAPER STORE': ['इससे सस्ता स्टोर नहीं', 'Sasta store nahi mila'], 'Current': ['अभी', 'Abhi'], 'Best Found': ['सबसे अच्छा मिला', 'Best mila'],
  'None cheaper': ['कोई सस्ता नहीं', 'Koi sasta nahi'], "in ScanCart's search": ['ScanCart की खोज में', 'ScanCart ki search mein'],
  'No cheaper store found right now': ['अभी कोई सस्ता स्टोर नहीं मिला', 'Abhi koi sasta store nahi mila'],
  // overview
  'Trust Score': ['ट्रस्ट स्कोर', 'Trust Score'], 'AUTHENTIC': ['असली', 'ASLI'], 'CAUTION': ['सावधान', 'DHYAN DO'], 'Fake Review': ['नकली रिव्यू', 'Fake review'],
  'Fake Reviews': ['नकली रिव्यू', 'Fake reviews'], 'Fair': ['ठीक', 'Theek'], 'Reviews OK': ['रिव्यू ठीक', 'Reviews theek'], 'Seller OK': ['विक्रेता ठीक', 'Seller theek'],
  'Fair Price': ['सही कीमत', 'Sahi price'], 'Save Money': ['पैसे बचाएं', 'Paise bachao'], 'Suspicious': ['संदिग्ध', 'Shak wala'],
  'Seller Unknown': ['विक्रेता अनजान', 'Seller anjaan'], 'Check Seller': ['विक्रेता जाँचें', 'Seller check karo'], 'Seller Warning': ['विक्रेता चेतावनी', 'Seller warning'], 'Seller Verified': ['विक्रेता सत्यापित', 'Seller verified'],
  'Safe to buy — green light from ScanCart’s checks': ['खरीदने के लिए सुरक्षित — ScanCart की जाँच से हरी झंडी', 'Kharidne ke liye safe — ScanCart ke checks se green light'],
  'Safe to buy — green light from our AI': ['खरीदने के लिए सुरक्षित — हमारे AI से हरी झंडी', 'Kharidne ke liye safe — AI se green light'],
  'Proceed with caution — verify key details': ['सावधानी से आगे बढ़ें — ज़रूरी बातें जाँचें', 'Dhyan se aage badho — zaroori baatein check karo'],
  'Avoid this product — multiple risk signals': ['यह प्रोडक्ट न लें — कई खतरे के संकेत', 'Ye product mat lo — kai risk signals'],
  // seller
  'Seller Trust': ['विक्रेता पर भरोसा', 'Seller trust'], 'NO WARNINGS': ['कोई चेतावनी नहीं', 'Koi warning nahi'], 'Seller rating': ['विक्रेता रेटिंग', 'Seller rating'],
  'Not in our list yet': ['अभी हमारी सूची में नहीं', 'Abhi hamari list mein nahi'], 'Seller type': ['विक्रेता का प्रकार', 'Seller type'], 'Risk': ['जोखिम', 'Risk'],
  'Good rating': ['अच्छी रेटिंग', 'Achhi rating'], 'LOW': ['कम', 'LOW'], 'HIGH': ['ज़्यादा', 'HIGH'], '✓ Good rating': ['✓ अच्छी रेटिंग', '✓ Achhi rating'], 'Good ratings': ['अच्छी रेटिंग', 'Achhi ratings'],
  'OFFICIAL': ['आधिकारिक', 'OFFICIAL'], 'VERIFIED': ['सत्यापित', 'VERIFIED'], 'TRUSTED': ['भरोसेमंद', 'TRUSTED'], 'CHECK': ['जाँचें', 'CHECK'], 'WARNING': ['चेतावनी', 'WARNING'], 'UNKNOWN': ['अनजान', 'UNKNOWN'],
  'Known large seller': ['जाना-माना बड़ा विक्रेता', 'Jaana-maana bada seller'], 'Established seller': ['पुराना विक्रेता', 'Purana seller'], 'New seller': ['नया विक्रेता', 'Naya seller'],
  'Suspicious seller': ['संदिग्ध विक्रेता', 'Shak wala seller'], 'Seller not shown': ['विक्रेता नहीं दिखाया गया', 'Seller nahi dikhaya'], 'Fulfilled by the store': ['स्टोर खुद भेजता है', 'Store khud bhejta hai'],
  'Store badge (Choice / Assured)': ['स्टोर बैज (Choice / Assured)', 'Store badge (Choice / Assured)'],
  'Warning signs on this listing — check the seller before buying': ['इस लिस्टिंग में खतरे के संकेत — खरीदने से पहले विक्रेता जाँचें', 'Is listing mein warning signs — kharidne se pehle seller check karo'],
  'Some doubts — check the seller’s rating and reviews': ['कुछ शक — विक्रेता की रेटिंग और रिव्यू देखें', 'Thoda shak — seller ki rating aur reviews dekho'],
  'Seller looks fine': ['विक्रेता ठीक लगता है', 'Seller theek lagta hai'],
  'No warning signs — seller just isn’t in our list yet': ['कोई चेतावनी नहीं — विक्रेता बस अभी हमारी सूची में नहीं है', 'Koi warning nahi — seller bas abhi hamari list mein nahi hai'],
  // where to buy
  'Trusted stores + similar products': ['भरोसेमंद स्टोर + मिलते-जुलते प्रोडक्ट', 'Trusted stores + similar products'], 'Where to buy this product': ['यह प्रोडक्ट कहाँ से खरीदें', 'Ye product kahan se khareeden'],
  'YOU’RE HERE': ['आप यहाँ हैं', 'AAP YAHAN HO'], 'EXPLORE': ['देखें', 'DEKHO'], 'Similar products': ['मिलते-जुलते प्रोडक्ट', 'Similar products'],
  // popup
  'Signed out': ['साइन आउट', 'Signed out'], 'Sign in': ['साइन इन', 'Sign in'], 'Sign in to start scanning': ['जाँच शुरू करने के लिए साइन इन करें', 'Scan shuru karne ke liye sign in karo'],
  'Opens scancart.ai in a new tab.': ['scancart.ai नए टैब में खुलेगा।', 'scancart.ai naye tab mein khulega.'], 'New here?': ['नए हैं?', 'Naye ho?'], 'Create a free account': ['मुफ़्त खाता बनाएं', 'Free account banao'],
  'Shop Smarter.': ['समझदारी से खरीदें।', 'Smart shopping karo.'], 'Trust': ['भरोसा', 'Bharosa'], 'Every': ['हर', 'Har'], 'Purchase.': ['खरीद पर।', 'kharid pe.'],
  'ScanCart checks reviews, seller, price and listing details before you click Buy.': ['खरीदने से पहले ScanCart रिव्यू, विक्रेता, कीमत और लिस्टिंग जाँचता है।', 'Buy dabane se pehle ScanCart reviews, seller, price aur listing check karta hai.'],
  'Fake reviews': ['नकली रिव्यू', 'Fake reviews'], 'Fake sales': ['नकली सेल', 'Fake sales'], 'Seller check': ['विक्रेता जाँच', 'Seller check'], 'Listing rules': ['लिस्टिंग नियम', 'Listing rules'],
  'Open a product to scan it': ['जाँचने के लिए कोई प्रोडक्ट खोलें', 'Check karne ke liye koi product kholo'],
  "ScanCart works on any online shop's product page, for example:": ['ScanCart किसी भी ऑनलाइन दुकान के प्रोडक्ट पेज पर काम करता है, जैसे:', 'ScanCart kisi bhi online shop ke product page pe kaam karta hai, jaise:'],
  // review check reasons
  'talks about real use': ['असली इस्तेमाल की बात करता है', 'asli use ki baat karta hai'], 'mentions a downside too': ['कमी भी बताता है', 'kami bhi batata hai'],
  'detailed': ['विस्तार से', 'detail mein'], 'too short to judge': ['परखने के लिए बहुत छोटा', 'judge karne ke liye bahut chhota'],
  'not enough detail to judge': ['परखने के लिए काफ़ी जानकारी नहीं', 'judge karne ke liye kaafi detail nahi'],
  'almost the same words as another review': ['दूसरे रिव्यू जैसे ही शब्द', 'doosre review jaise hi shabd'], 'contains a link, number or promotion': ['इसमें लिंक, नंबर या प्रचार है', 'isme link, number ya promotion hai'],
  'lots of hype words, no real details': ['बढ़ा-चढ़ाकर तारीफ़, असली बात नहीं', 'bas hype words, asli detail nahi'], 'written mostly in capitals': ['ज़्यादातर बड़े अक्षरों में', 'zyadatar capital letters mein'],
  'too many exclamation marks': ['बहुत सारे विस्मयादिबोधक चिह्न (!)', 'bahut saare ! marks'], 'only generic praise': ['सिर्फ़ आम तारीफ़', 'sirf generic tareef'],
  // where to buy extras
  'Budget': ['बजट', 'Budget'], 'Premium': ['प्रीमियम', 'Premium'],
  'Tap to check price': ['कीमत देखने के लिए टैप करें', 'Price dekhne ke liye tap karo'], 'Value': ['पैसा वसूल', 'Value'], '🇮🇳 Indian Brand': ['🇮🇳 भारतीय ब्रांड', '🇮🇳 Indian brand'],
  'AI found search links to help explore alternatives on Amazon and Flipkart.': ['AI ने Amazon और Flipkart पर विकल्प खोजने के लिंक दिए हैं।', 'AI ne Amazon aur Flipkart pe alternatives dhoondhne ke links diye hain.'],
  'Click any card to explore alternatives on Amazon or Flipkart': ['Amazon या Flipkart पर विकल्प देखने के लिए किसी कार्ड पर क्लिक करें', 'Amazon ya Flipkart pe alternatives dekhne ke liye kisi card pe click karo'],
  'ScanCart store rating = genuine-product guarantee, brand warranty, returns and seller control. It rates the store, not today’s price — tap to search this product there.': ['ScanCart स्टोर रेटिंग = असली प्रोडक्ट की गारंटी, ब्रांड वारंटी, रिटर्न और विक्रेता पर नियंत्रण। यह स्टोर को आंकती है, आज की कीमत को नहीं — वहाँ यह प्रोडक्ट खोजने के लिए टैप करें।', 'ScanCart store rating = asli product guarantee, brand warranty, returns aur seller control. Ye store ko rate karti hai, aaj ke price ko nahi — wahan ye product search karne ke liye tap karo.'],
  'Any other shop': ['कोई भी दूसरी दुकान', 'Koi bhi doosri shop'], 'Tip': ['सुझाव', 'Tip'], 'Price watches': ['कीमत पर नज़र', 'Price watches'], 'Language': ['भाषा', 'Bhasha'],
}

const L = (lang) => (lang === 'hi' ? 0 : 1)

// ── Phrases with numbers: [pattern, (m, lang) => text] ──
const P = [
  [/^(\d+) · (Safe to buy|Buy with caution|Do not buy|Sale looks fake)$/, (m, l) => `${m[1]} · ${W[m[2]][L(l)]}`],
  [/^ScanCart (\d+) · (Safe to buy|Buy with caution|Do not buy)$/, (m, l) => `ScanCart ${m[1]} · ${W[m[2]][L(l)]}`],
  [/^(\d+) of (\d+) checks completed$/, (m, l) => [`${m[2]} में से ${m[1]} जाँचें पूरी`, `${m[2]} mein se ${m[1]} checks poore`][L(l)]],
  [/^(\d+) of (\d+) positive$/, (m, l) => [`${m[2]} में से ${m[1]} अच्छे`, `${m[2]} mein se ${m[1]} positive`][L(l)]],
  [/^reviews? read$/, (m, l) => ['रिव्यू पढ़े', 'reviews padhe'][L(l)]],
  [/^([\d,]+) ratings in all$/, (m, l) => [`कुल ${m[1]} रेटिंग`, `kul ${m[1]} ratings`][L(l)]],
  [/^(\d+) from this page \+ (\d+) from (\d+) review pages?$/, (m, l) => [`${m[1]} इस पेज से + ${m[2]} रिव्यू के ${m[3]} पेज से`, `${m[1]} is page se + ${m[2]} ${m[3]} review pages se`][L(l)]],
  [/^(\d+) look real$/, (m, l) => [`${m[1]} असली लगते हैं`, `${m[1]} asli lagte hain`][L(l)]],
  [/^(\d+) look fake$/, (m, l) => [`${m[1]} नकली लगते हैं`, `${m[1]} nakli lagte hain`][L(l)]],
  [/^(\d+) can't judge$/, (m, l) => [`${m[1]} परख नहीं सकते`, `${m[1]} judge nahi kar sakte`][L(l)]],
  [/^(\d+) of (\d+) reviews? marked Verified Purchase$/, (m, l) => [`${m[2]} में से ${m[1]} रिव्यू "Verified Purchase"`, `${m[2]} mein se ${m[1]} reviews "Verified Purchase"`][L(l)]],
  [/^⚠ (.+): (\d+) of (\d+) buyers unhappy$/, (m, l) => `⚠ ${tr(m[1], l)}: ${[`${m[3]} में से ${m[2]} खरीदार नाखुश`, `${m[3]} mein se ${m[2]} buyers naakhush`][L(l)]}`],
  [/^What buyers say · (.+)$/, (m, l) => `${['खरीदार क्या कहते हैं', 'Buyers kya kehte hain'][L(l)]} · ${tr(m[1], l)}`],
  [/^Real reviews only: (\d+) counted, (\d+) fake left out( · tap a topic)?$/, (m, l) => [`सिर्फ़ असली रिव्यू: ${m[1]} गिने, ${m[2]} नकली छोड़े${m[3] ? ' · किसी विषय पर टैप करें' : ''}`, `Sirf asli reviews: ${m[1]} gine, ${m[2]} fake chhode${m[3] ? ' · topic pe tap karo' : ''}`][L(l)]],
  [/^Not enough reviews about: (.+)$/, (m, l) => `${['इन पर काफ़ी रिव्यू नहीं', 'Inpe kaafi reviews nahi'][L(l)]}: ${m[1].split(', ').map(x => tr(x, l)).join(', ')}`],
  [/^Across all ([\d,]+) ratings, about (\d+)% look suspicious from the rating pattern\.$/, (m, l) => [`सभी ${m[1]} रेटिंग में से करीब ${m[2]}% रेटिंग के पैटर्न से संदिग्ध लगती हैं।`, `Sabhi ${m[1]} ratings mein se kareeb ${m[2]}% rating pattern se suspicious lagti hain.`][L(l)]],
  [/^This page has (\d+) real-looking reviews?\.$/, (m, l) => [`इस पेज पर ${m[1]} असली लगने वाले रिव्यू हैं।`, `Is page pe ${m[1]} asli lagne wale reviews hain.`][L(l)]],
  [/^(\d+) (good|bad|mixed)$/, (m, l) => `${m[1]} ${tr({ good: 'Good', bad: 'Bad', mixed: 'Mixed' }[m[2]], l)}`],
  [/^real reviews? give an opinion$/, (m, l) => ['असली रिव्यू ने राय दी', 'asli reviews ne raay di'][L(l)]],
  [/^Showing (\d+) of (\d+) quotes\.$/, (m, l) => [`${m[2]} में से ${m[1]} बातें दिखा रहे हैं।`, `${m[2]} mein se ${m[1]} quotes dikha rahe hain.`][L(l)]],
  [/^(.+) “Customers say” · all reviews$/, (m, l) => `${m[1]} “Customers say” · ${['सभी रिव्यू', 'sabhi reviews'][L(l)]}`],
  [/^Sign in to (.+) in ScanCart →$/, (m, l) => [`ScanCart में ${m[1]} पर साइन इन करें →`, `ScanCart mein ${m[1]} pe sign in karo →`][L(l)]],
  [/^Reading review page (\d+) of (\d+)…$/, (m, l) => [`रिव्यू पेज ${m[1]}/${m[2]} पढ़ रहे हैं…`, `Review page ${m[1]}/${m[2]} padh rahe hain…`][L(l)]],
  [/^Shop blocked the review pages \((\d+)\)$/, (m, l) => [`दुकान ने रिव्यू पेज रोक दिए (${m[1]})`, `Shop ne review pages rok diye (${m[1]})`][L(l)]],
  // price
  [/^(↓|↑|•) (\d+)% vs avg$/, (m, l) => `${m[1]} ${m[2]}% ${['औसत से', 'avg se'][L(l)]}`],
  [/^High (₹[\d,]+)$/, (m, l) => `${['सबसे ज़्यादा', 'Sabse zyada'][L(l)]} ${m[1]}`],
  [/^Average (₹[\d,]+)$/, (m, l) => `${['औसत', 'Average'][L(l)]} ${m[1]}`],
  [/^Prices seen by you on this (browser|phone)$/, (m, l) => [`आपने इस ${m[1] === 'phone' ? 'फ़ोन' : 'ब्राउज़र'} पर देखी कीमतें`, `Aapne is ${m[1]} pe dekhe prices`][L(l)]],
  [/^Prices seen by ScanCart users$/, (m, l) => ['ScanCart यूज़र्स की देखी कीमतें', 'ScanCart users ke dekhe prices'][L(l)]],
  [/^fills in as you visit on more days$/, (m, l) => ['जितने दिन देखेंगे, उतना भरेगा', 'jitne din dekhoge, utna bharega'][L(l)]],
  [/^About the usual price \((₹[\d,]+)–(₹[\d,]+) over (\d+) days\)\.$/, (m, l) => [`लगभग सामान्य कीमत (${m[3]} दिनों में ${m[1]}–${m[2]})।`, `Lagbhag normal price (${m[3]} din mein ${m[1]}–${m[2]}).`][L(l)]],
  [/^Lowest price ScanCart has seen in (\d+) days \(earlier low (₹[\d,]+)\)\.$/, (m, l) => [`${m[1]} दिनों में ScanCart की देखी सबसे कम कीमत (पहले सबसे कम ${m[2]})।`, `${m[1]} din mein ScanCart ka dekha sabse kam price (pehle ${m[2]} tha).`][L(l)]],
  [/^Shows (\d+)% off, but this listing has sold near (₹[\d,]+) for (\d+) days — the sale price is not really lower\.$/, (m, l) => [`${m[1]}% छूट दिखा रहा है, पर यह ${m[3]} दिनों से करीब ${m[2]} में बिक रहा है — सेल की कीमत असल में कम नहीं है।`, `${m[1]}% off dikha raha hai, par ye ${m[3]} din se ${m[2]} ke aas-paas bik raha hai — sale price asal mein kam nahi hai.`][L(l)]],
  [/^Higher than usual: it averaged (₹[\d,]+) over (\d+) days\.$/, (m, l) => [`सामान्य से ज़्यादा: ${m[2]} दिनों का औसत ${m[1]} था।`, `Normal se zyada: ${m[2]} din ka average ${m[1]} tha.`][L(l)]],
  [/^No lower price found in ScanCart's search — (₹[\d,]+) looks like a fair price\.$/, (m, l) => [`ScanCart की खोज में कम कीमत नहीं मिली — ${m[1]} सही कीमत लगती है।`, `ScanCart ki search mein kam price nahi mila — ${m[1]} sahi price lagta hai.`][L(l)]],
  [/^SAVE (₹[\d,]+)$/, (m, l) => `${['बचत', 'BACHAT'][L(l)]} ${m[1]}`],
  [/^Save (₹[\d,]+)$/, (m, l) => [`${m[1]} बचाएं`, `${m[1]} bachao`][L(l)]],
  [/^Save up to (₹[\d,]+) with these alternatives$/, (m, l) => [`इन विकल्पों से ${m[1]} तक बचाएं`, `In alternatives se ${m[1]} tak bachao`][L(l)]],
  [/^Today (₹[\d,]+)$/, (m, l) => `${W.Today[L(l)]} ${m[1]}`],
  [/^Watching · alert (on any drop|at (₹[\d,]+))\. Started at (₹[\d,]+)\.$/, (m, l) => m[2]
    ? [`नज़र रख रहे हैं · ${m[2]} पर बताएंगे। शुरुआत ${m[3]} पर।`, `Nazar rakh rahe hain · ${m[2]} pe batayenge. Shuru ${m[3]} pe.`][L(l)]
    : [`नज़र रख रहे हैं · कीमत गिरते ही बताएंगे। शुरुआत ${m[3]} पर।`, `Nazar rakh rahe hain · price girte hi batayenge. Shuru ${m[3]} pe.`][L(l)]],
  [/^(\d+)\/100 — (AUTHENTIC|CAUTION|HIGH RISK)$/, (m, l) => `${m[1]}/100 — ${W[m[2]][L(l)]}`],
  [/^(.+) isn't in ScanCart's seller list yet — no warning signs found$/, (m, l) => [`${m[1]} अभी ScanCart की विक्रेता सूची में नहीं है — कोई चेतावनी नहीं मिली`, `${m[1]} abhi ScanCart ki seller list mein nahi hai — koi warning nahi mili`][L(l)]],
  [/^Trust Score: (\d+)\/100\.(.*)$/, (m, l) => `${W['Trust Score'][L(l)]}: ${m[1]}/100.${m[2]}`],
  [/^· ([\d,]+) ratings?$/, (m, l) => `· ${m[1]} ${['रेटिंग', 'ratings'][L(l)]}`],
  [/^[✓·⚠] (.+)$/, (m, l) => { const parts = m[1].split(/, |; /); const out = parts.map(x => W[x] ? W[x][L(l)] : null); return out.every(Boolean) ? m[0][0] + ' ' + out.join(', ') : m[0] }],
  [/^High confidence — Genuine product \((low|medium|high) counterfeit risk(?:, (\d+) compliance concern\(s\))?\)$/, (m, l) => {
    const r = { low: ['कम', 'kam'], medium: ['मध्यम', 'medium'], high: ['ज़्यादा', 'zyada'] }[m[1]][L(l)]
    return [`पक्का भरोसा — असली प्रोडक्ट (नकली का जोखिम ${r}${m[2] ? `, ${m[2]} नियम-संबंधी बातें` : ''})`, `Pakka bharosa — asli product (nakli ka risk ${r}${m[2] ? `, ${m[2]} compliance concerns` : ''})`][L(l)]
  }],
  [/^Found (\d+) alternatives? on Indian e-commerce(?: — best saves (₹[\d,]+))?\. Click any card to view\.$/, (m, l) => [`भारतीय ई-कॉमर्स पर ${m[1]} विकल्प मिले${m[2] ? ` — सबसे ज़्यादा बचत ${m[2]}` : ''}। देखने के लिए किसी कार्ड पर क्लिक करें।`, `Indian e-commerce pe ${m[1]} alternatives mile${m[2] ? ` — sabse zyada bachat ${m[2]}` : ''}. Dekhne ke liye card pe click karo.`][L(l)]],
  [/^(\d+)\+ bought last month$/, (m, l) => [`पिछले महीने ${m[1]}+ खरीदे गए`, `Pichhle mahine ${m[1]}+ bike`][L(l)]],
]

/** Translate one piece of ScanCart text (or return it unchanged). */
export function tr(text, lang) {
  if (!text || lang === 'en' || !lang) return text
  const t = text.trim()
  if (!t) return text
  const lead = text.slice(0, text.indexOf(t)), tail = text.slice(text.indexOf(t) + t.length)
  const one = (s) => {
    if (W[s]) return W[s][L(lang)]
    for (const [re, fn] of P) { const m = s.match(re); if (m) return fn(m, lang) }
    return null
  }
  let out = one(t)
  if (out == null && t.includes(' · ')) {               // "a · b · c": translate each part
    const parts = t.split(' · ').map(p => one(p) ?? p)
    if (parts.some((p, i) => p !== t.split(' · ')[i])) out = parts.join(' · ')
  }
  return out == null ? text : lead + out + tail
}

// ── Translate a drawn view (shadow root or document) and keep it translated as it changes ──
const SKIP = '.sc-prod-name, .sc-rv-txt, .sc-asp-q, .sc-rq, .sc-alt-name, .sc-alt-reason, [data-raw], style, script, textarea, input'
const ORIG = new WeakMap()
function translateNode(node, lang) {
  if (node.nodeType !== 3) return
  const el = node.parentElement
  if (!el || el.closest(SKIP)) return
  const cur = node.nodeValue
  if (!cur || !/[A-Za-z]/.test(ORIG.get(node) ?? cur)) return
  let orig = ORIG.get(node)
  if (orig == null || (cur !== orig && cur !== node.__scT)) { orig = cur; ORIG.set(node, orig) }   // new text drawn by the panel
  const out = tr(orig, lang)
  if (out !== cur) { node.__scT = out; node.nodeValue = out }
}
function translateAttrs(el, lang) {
  for (const a of ['placeholder', 'title', 'aria-label']) {
    if (!el.hasAttribute?.(a)) continue
    const key = '__sc_' + a
    const orig = el[key] ?? el.getAttribute(a)
    el[key] = orig
    const out = tr(orig, lang)
    if (out !== el.getAttribute(a)) el.setAttribute(a, out)
  }
}
export function translateTree(root, lang) {
  if (!root) return
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let n; while ((n = w.nextNode())) translateNode(n, lang)
  root.querySelectorAll?.('[placeholder], [title], [aria-label]').forEach(el => translateAttrs(el, lang))
}
/** Keeps `root` in the current language: translates now and whenever new ScanCart text is drawn. */
export function attachTranslator(root, getCurrent) {
  let queued = false
  const run = () => { queued = false; translateTree(root, getCurrent()) }
  const mo = new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(run) } })
  mo.observe(root, { childList: true, subtree: true, characterData: true })
  run()
  return () => mo.disconnect()
}
