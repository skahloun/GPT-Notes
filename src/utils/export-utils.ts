export function notesToDocText(classTitle: string, dateISO: string, refinedTranscript: string, notes: any) {
  const H = (txt: string) => txt.toUpperCase();
  const b = (txt: string) => `**${txt}**`;

  const section = (title: string, arr: string[]) => {
    const bullets = (arr || []).map(x => `• ${x}`).join("\n");
    return `${H(title)}\n${bullets}\n\n`;
  };

  const header = `${classTitle} - ${dateISO}\n\n`;
  const body = [
    section("Introduction", notes.introduction),
    section("Key Concepts", notes.keyConcepts),
    section("Explanations", notes.explanations),
    section("Definitions", notes.definitions),
    section("Summary", notes.summary),
    section("Potential Exam Questions", notes.examQuestions),
    H("REFINED TRANSCRIPT"),
    refinedTranscript
  ].join("");

  return header + body;
}
