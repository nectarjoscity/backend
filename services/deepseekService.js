import { generateText } from 'ai';
import deepseek from '../config/deepseek.js';

const ALLOWED_SERVICES = ['category', 'menuItem', 'user', 'order'];
const ALLOWED_OPERATIONS = ['list', 'get', 'create', 'update', 'delete'];
const ALLOWED_MODES = ['action', 'chat', 'clarify'];

// --- Utility: JSON Coercion ---
function coerceToJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    const match = text && text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

// --- Utility: Sanitize model output ---
function sanitizeInterpretation(raw) {
  const safe = {
    mode: 'chat',
    targetService: undefined,
    operation: undefined,
    filters: {},
    needsClarification: false,
  };

  if (!raw || typeof raw !== 'object') return safe;

  // Mode
  const mode = String(raw.mode || '').trim();
  if (ALLOWED_MODES.includes(mode)) safe.mode = mode;

  // Action fields
  const service = String(raw.targetService || '').trim();
  const operation = String(raw.operation || '').trim();
  const filters = raw.filters && typeof raw.filters === 'object' ? raw.filters : {};

  if (safe.mode === 'action') {
    if (ALLOWED_SERVICES.includes(service)) safe.targetService = service;
    if (ALLOWED_OPERATIONS.includes(operation)) safe.operation = operation;
  }

  const sanitizedFilters = {};
  if (safe.mode === 'action') {
    if (filters.id) sanitizedFilters.id = String(filters.id);
    if (filters.search) sanitizedFilters.search = String(filters.search);
    if (filters.category) sanitizedFilters.category = String(filters.category);
    if (filters.name) sanitizedFilters.name = String(filters.name);
    if (filters.email) sanitizedFilters.email = String(filters.email);

    if (filters.payload && typeof filters.payload === 'object') {
      const p = filters.payload;
      const payload = {};
      for (const key of [
        'name', 'description', 'emoji', 'imageUrl', 'isActive',
        'price', 'currency', 'isAvailable', 'category',
        'email', 'role',
        'customerName', 'customerEmail', 'customerPhone',
        'totalAmount', 'status'
      ]) {
        if (p[key] != null) payload[key] = p[key];
      }

      if (Array.isArray(p.orderItems)) {
        payload.orderItems = p.orderItems.map(item => ({
          menuItem: String(item.menuItem),
          quantity: Number(item.quantity),
          price: Number(item.price),
          notes: String(item.notes || '')
        }));
      }
      sanitizedFilters.payload = payload;
    }
  }

  if (safe.mode === 'action') safe.filters = sanitizedFilters;

  // Clarification & chat
  if (typeof raw.needsClarification === 'boolean') safe.needsClarification = raw.needsClarification;
  if (raw.clarificationQuestion) safe.clarificationQuestion = String(raw.clarificationQuestion);
  if (raw.message) safe.message = String(raw.message);

  return safe;
}

// --- Utility: Context rendering for prompt ---
function renderConversation(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const trimmed = messages.slice(-8);
  const lines = trimmed.map(m => `${m.role?.toUpperCase() || 'USER'}: ${m.content ?? ''}`);
  return `Conversation so far:\n${lines.join('\n')}\n`;
}

// --- Pre-parser: detect "I don't know" style phrases ---
function preParseUserQuery(userText) {
  const lowerCaseText = userText.toLowerCase();
  const uncertaintyPhrases = ["i dont know", "idk", "i have no idea", "no idea", "not sure"];

  if (uncertaintyPhrases.some(p => lowerCaseText.includes(p))) {
    return {
      mode: "chat",
      message: "No worries! I can help with that. Are you in the mood for something healthy, filling, or light?"
    };
  }

  return null;
}

// --- Friendly fallback when backend finds no results ---
function handleNoResults(searchTerm, userContext = {}) {
  const term = (searchTerm || '').trim().toLowerCase();

  const healthyExamples = [
    "grilled salmon with veggies",
    "chicken quinoa bowl",
    "fresh garden salad"
  ];
  const spicyExamples = [
    "spicy jollof rice with chicken",
    "peri-peri shrimp bowl",
    "pepper soup with plantain"
  ];
  const sweetExamples = [
    "fruit parfait",
    "yogurt bowl",
    "smoothie"
  ];
  const lightExamples = [
    "veggie stir-fry",
    "chicken wrap",
    "avocado salad"
  ];

  let examples = [];
  let baseMessage = `I couldn’t find anything exactly matching "${term}".`;

  // Detect tone and context
  if (term.includes("spicy") || userContext.recentCuisinePreference === "spicy") {
    examples = spicyExamples;
    baseMessage += " Maybe you’ll like something with a kick!";
  } else if (
    term.includes("healthy") ||
    userContext.recentGoal === "eat healthy" ||
    userContext.recentGoal === "lose weight"
  ) {
    examples = healthyExamples;
    baseMessage += " Here are a few healthy ideas:";
  } else if (term.includes("sweet")) {
    examples = sweetExamples;
    baseMessage += " Maybe a little something sweet?";
  } else if (term.includes("light")) {
    examples = lightExamples;
    baseMessage += " How about something light and fresh?";
  } else {
    examples = healthyExamples;
    baseMessage += " Would you like to see some popular options instead?";
  }

  const friendlySuggestions = examples.slice(0, 3).join(", ");

  return {
    mode: "chat",
    message: `${baseMessage} For example: ${friendlySuggestions}.`
  };
}


export async function interpretUserQuery(userText, messages = [], memoryContext = {}) {
  const preParsed = preParseUserQuery(userText);
  if (preParsed) return sanitizeInterpretation(preParsed);

  const convo = renderConversation(messages);

  const prompt = `You are a friendly restaurant waiter assistant and API intent router.
Your job has three parts:
1) Handle user orders or menu requests.
2) Chat naturally when the user is unsure or casual.
3) Help users find food combinations that suit their goals (health, diet, allergies, etc).

Always output JSON ONLY in this schema:
{
  "mode": "action" | "clarify" | "chat",
  "targetService"?: "category"|"menuItem"|"user"|"order",
  "operation"?: "list"|"get"|"create"|"update"|"delete",
  "filters"?: {"id"?:string,"search"?:string,"category"?:string,"email"?:string,"name"?:string,"payload"?:object},
  "needsClarification"?: boolean,
  "clarificationQuestion"?: string,
  "message"?: string,
  "recommendations"?: [{
    "searchFilters": object,
    "items": [{"role":"protein|carb|vegetable|drink|side","nameHint":string}],
    "rationale": string,
    "fitScore": number,
    "confidence": "low"|"medium"|"high"
  }],
  "explanation"?: string
}

--- SMART RULES ---
- Never treat short answers like “no”, “no i don’t”, “nah”, “none”, “nope”, “not really”, “yes”, “sure”, “ok” as search terms.
- If they appear after a question about allergies or preferences, interpret meaningfully (e.g., “no i don’t” = no allergies).
- If the user says something like “light and healthy” and it returns no results, switch to chat mode and offer friendly alternatives.
- If nothing matches a search, say something like:
  “I didn’t find anything with that exact name, but our grilled salmon, quinoa salad, or veggie bowl are light and healthy options. Want to try one?”
- Always maintain context from recent turns.
- If unsure, favor mode="chat" with a warm, short message.

--- CONTEXT MEMORY ---
{
  "recentGoal": ${JSON.stringify(memoryContext.recentGoal || null)},
  "recentCuisinePreference": ${JSON.stringify(memoryContext.recentCuisinePreference || null)},
  "recentAllergies": ${JSON.stringify(memoryContext.recentAllergies || [])},
  "recentMainChoice": ${JSON.stringify(memoryContext.recentMainChoice || null)},
  "lastUserIntent": ${JSON.stringify(memoryContext.lastUserIntent || null)}
}

${convo}
CURRENT USER: ${userText}`;

  const { text } = await generateText({
    model: deepseek('deepseek-chat'),
    prompt
  });

  let parsed = coerceToJson(text);

  // --- Final safety layer ---
  if (!parsed) throw new Error('Failed to interpret user intent');

  // Handle invalid or empty searches gracefully
 if (
  parsed.mode === "action" &&
  parsed.filters?.search &&
  ["no", "none", "nothing", "nope", "nah", "not really"].includes(parsed.filters.search.toLowerCase())
) {
  parsed = {
    mode: "chat",
    message: "Got it! So no allergies or restrictions. Let me suggest a few healthy options."
  };
}

// 🔥 NEW: Smart fallback for "no results" or abstract searches
if (
  parsed.mode === "action" &&
  parsed.targetService === "menuItem" &&
  parsed.filters?.search &&
  (
    parsed.filters.search.toLowerCase().includes("light") ||
    parsed.filters.search.toLowerCase().includes("healthy") ||
    parsed.filters.search.toLowerCase().includes("spicy") ||
    parsed.filters.search.toLowerCase().includes("sweet")
  )
) {
  parsed = handleNoResults(parsed.filters.search, memoryContext);
}

  return sanitizeInterpretation(parsed);
}
