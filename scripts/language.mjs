// The one place an easyClaude message to Claude gets the user's language.
//
// Every message a hook sends Claude is English, and three times an English message pulled
// a Thai user's notes into English: the session opener in 0.1.10, the bug-report line in
// 0.2.0, and the page check in 0.2.4, which got English and once Japanese where Thai was
// asked, in four Thai runs of six on 2026-10-02. Each fix covered one message. This covers
// them all: prompt-check.mjs and every hold in verify.mjs pass through withLanguage(), and
// a test fails if verify.mjs holds a turn anywhere else.
//
// Only for a message mostly in a script other than Latin: a line naming the user's language
// on English messages is what once got English requests Hungarian replies. Letters and marks
// both: Thai writes most vowels as marks, and letters alone undercounted "เปลี่ยนชื่อร้านจาก
// Plant Corner เป็น Green Corner" as mostly Latin. Even counted right, that line is half
// Latin, so the bar is under half: English has next to none of another script.
export const writesNonLatin = (text) => {
  const chars = String(text ?? '').match(/[\p{L}\p{M}]/gu) ?? [];
  const other = chars.filter((c) => !/[\p{Script=Latin}\p{Script=Inherited}]/u.test(c)).length;
  return chars.length > 0 && other >= 0.3 * chars.length;
};

export const LANGUAGE_LINE = "Every note the user sees, between steps included, goes in the language of the user's " +
  'message, not in the language of these lines.';

// The start of the user's message, quoted, so Claude has the language in front of it and
// does not guess one: the Japanese reply came from a hold that named no language at all.
export function withLanguage(message, userText) {
  if (!message || !writesNonLatin(userText)) return message;
  const sample = String(userText).replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${message}\n\n${LANGUAGE_LINE} The user's message begins: "${sample}"`;
}
