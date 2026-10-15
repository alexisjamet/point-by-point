export type Lang = "en" | "fr";

const en = {
  notePlaceholder: "Your reply or question",
  noteLabel: (quote: string) => `Annotation on: ${quote}`,
  remove: "Remove",
  done: "Done",
  remarkLabel: "General remark",
  remarkPlaceholder: "General remark (optional)",
  send: "Send",
  sending: "Sending…",
  sent: "Sent",
  count: (n: number) => (n === 1 ? "1 annotation" : `${n} annotations`),
  nothingToSend: "Add an annotation or a general remark before sending.",
  sendFailed: "The message could not be sent.",
  copy: "Copy the message",
  copied: "Copied. Paste it in the conversation.",
  copyFailed: "Copy it by hand from the box below.",
  annotate: (start: string) => `Annotate: ${start}`,
  editAnnotation: (start: string) => `Edit annotation: ${start}`,
  noStorage: "Drafts can't be saved on this device: send before leaving.",
  previousContext: "(About an earlier response)",
  loading: "Writing…",
  hint: "Click a sentence or select a passage to annotate it.",
  hintTouch: "Tap a sentence or select a passage to annotate it.",
  diagnosticTitle: "Display diagnostic",
  diagnosticRequest: "Request fullscreen",
  diagnosticBack: "Back to inline",
};

export type Strings = typeof en;

const fr: Strings = {
  notePlaceholder: "Ta réponse ou ta question",
  noteLabel: (quote) => `Annotation sur : ${quote}`,
  remove: "Retirer",
  done: "Terminé",
  remarkLabel: "Remarque générale",
  remarkPlaceholder: "Remarque générale (optionnelle)",
  send: "Envoyer",
  sending: "Envoi…",
  sent: "Envoyé",
  count: (n) => (n <= 1 ? `${n} annotation` : `${n} annotations`),
  nothingToSend: "Ajoute une annotation ou une remarque générale avant d'envoyer.",
  sendFailed: "Le message n'a pas pu être envoyé.",
  copy: "Copier le message",
  copied: "Copié. Colle-le dans la conversation.",
  copyFailed: "Copie-le à la main depuis le cadre ci-dessous.",
  annotate: (start) => `Annoter : ${start}`,
  editAnnotation: (start) => `Modifier l'annotation : ${start}`,
  noStorage: "Les brouillons ne peuvent pas être sauvegardés sur cet appareil : envoie avant de partir.",
  previousContext: "(À propos d'une réponse précédente)",
  loading: "Rédaction…",
  hint: "Clique sur une phrase ou sélectionne un passage pour l'annoter.",
  hintTouch: "Touche une phrase ou sélectionne un passage pour l'annoter.",
  diagnosticTitle: "Diagnostic d'affichage",
  diagnosticRequest: "Demander le plein écran",
  diagnosticBack: "Revenir en ligne",
};

const strings: Record<Lang, Strings> = { en, fr };

/** French when the host announces a French locale, English otherwise. */
export function pickLang(locale: string | undefined): Lang {
  return locale?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function t(lang: Lang): Strings {
  return strings[lang];
}
