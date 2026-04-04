/**
 * 2-week campaign: Registry Access for Lawyers in Ukraine
 * Target: lawyers, advocates, legal professionals in Ukraine
 * Offer: Business tariff 4999 грн/міс + all other databases free
 */

export const CAMPAIGN_NAME = "registry-access-2w";

export const PRODUCT_CONTEXT = `
## Продукт: legal.org.ua — AI-платформа для юристів

### Головна пропозиція
AI-платформа legal.org.ua надає адвокатам миттєвий доступ до державних реєстрів через чат.
Замість заповнення форм та очікування — просто пишете запит звичайною мовою, і AI повертає структуровану відповідь за секунди.

### Тариф «Бізнес» — 4 999 грн/міс:
- 600 запитів до ДРРП (Державний реєстр речових прав на нерухоме майно)
- 1 500 запитів до ДРОРМ (Державний реєстр обтяжень рухомого майна)
- Вартість: від 8 грн за запит (через посередника — 60-150 грн)

### БОНУС: При покупці будь-якого тарифу — безкоштовний доступ до ВСІХ інших баз:
- ЄДР (Єдиний державний реєстр юридичних осіб)
- Реєстр боржників
- ЄДРСР (Єдиний державний реєстр судових рішень) — повнотекстовий пошук з AI
- Дані Верховної Ради (законопроєкти, голосування)
- Реєстри НКЦПФР через Трембіту (цінні папери, пенсійні фонди, учасники ринків капіталу, ІСІ)

### Ключові переваги
- Авторизація через Дія.Підпис
- AI-аналітика судових рішень
- Перевірка нерухомості за секунди замість годин
- Офіційний API-доступ через ДП «НАІС»

### Стаття з деталями
https://www.linkedin.com/posts/vladimir-ovcharov_legaltech-augaukauiauuauqaugauy-avkauwauoauxauy-activity-7445837205706579968-_sHe
`;

// Search queries rotated daily to find different lead segments
export const DAILY_SEARCH_QUERIES = [
  { day: 1, keywords: "адвокат нерухомість", title: "адвокат OR partner OR керуючий партнер" },
  { day: 2, keywords: "юрист корпоративне право", title: "Head OR Director OR Senior" },
  { day: 3, keywords: "адвокат земельне право будівництво", title: "адвокат OR advocate OR партнер" },
  { day: 4, keywords: "lawyer due diligence compliance", title: "lawyer OR counsel OR head" },
  { day: 5, keywords: "адвокат сімейне право спадщина", title: "адвокат OR керуючий OR founder" },
  { day: 6, keywords: "юрист інтелектуальна власність IT", title: "IP lawyer OR IT lawyer OR Head" },
  { day: 7, keywords: "адвокат кримінальне право захист", title: "адвокат OR partner OR director" },
  { day: 8, keywords: "юрист фінтех банківське право", title: "lawyer OR counsel OR CLO OR CEO" },
  { day: 9, keywords: "адвокат господарське право арбітраж", title: "адвокат OR арбітр OR partner" },
  { day: 10, keywords: "legal counsel in-house юрист", title: "General Counsel OR Head of Legal OR CLO" },
  { day: 11, keywords: "адвокат податкове право", title: "tax lawyer OR адвокат OR partner" },
  { day: 12, keywords: "юрист страхування відшкодування", title: "lawyer OR адвокат OR director" },
  { day: 13, keywords: "адвокат медичне право", title: "адвокат OR lawyer OR partner" },
  { day: 14, keywords: "юрист міжнародне право інвестиції", title: "international lawyer OR counsel OR partner" },
];

// Optimal LinkedIn posting/messaging times (Kyiv timezone UTC+2/+3)
// Best engagement: Tue-Thu 8-10am, 12-1pm, 5-6pm
export const OPTIMAL_HOURS_UTC = [6, 7, 8, 10, 14, 15]; // UTC hours = Kyiv -2 in summer

// Message angle rotations to ensure variety
export const MESSAGE_ANGLES = [
  "pain_point_time", // Фокус на потрачений час: години на реєстри vs секунди
  "pain_point_cost", // Фокус на вартість: 60-150 грн за витяг vs 8 грн
  "social_proof",     // AWS підтримує, Google Cloud визнає, 23/25 від експертів
  "free_bonus",       // Бонус: всі бази безкоштовно при покупці тарифу
  "tech_innovation",  // Дія.Підпис, AI аналітика, офіційний API НАІС
  "competitor_gap",   // Жоден конкурент не має такого доступу до реєстрів
  "question_hook",    // Питання: скільки часу витрачаєте на перевірку нерухомості?
];

export function getMessageAngle(dayNumber: number, leadIndex: number): string {
  return MESSAGE_ANGLES[(dayNumber + leadIndex) % MESSAGE_ANGLES.length];
}
