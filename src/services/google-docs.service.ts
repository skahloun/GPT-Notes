import { google } from "googleapis";
import { NoteSections } from "./ai-analyzer";

export class GoogleDocsService {
  private oauth2Client;

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  generateAuthUrl(scopes: string[]) {
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes
    });
  }

  async setCredentialsFromCode(code: string) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    return tokens;
  }

  setCredentials(tokens: any) {
    this.oauth2Client.setCredentials(tokens);
  }

  async ensureFolder(drive: any, folderName: string) : Promise<string> {
    const list = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
      fields: "files(id, name)",
      spaces: "drive"
    });
    if (list.data.files && list.data.files.length > 0) return list.data.files[0].id as string;
    const create = await drive.files.create({
      requestBody: { name: folderName, mimeType: "application/vnd.google-apps.folder" },
      fields: "id"
    });
    return create.data.id as string;
  }

  async createNotesDoc(title: string, content: string, folderName: string = "Class Notes") {
    const docs = google.docs({ version: "v1", auth: this.oauth2Client });
    const drive = google.drive({ version: "v3", auth: this.oauth2Client });

    const folderId = await this.ensureFolder(drive, folderName);

    // Create empty doc
    const doc = await docs.documents.create({ requestBody: { title } });
    const docId = doc.data.documentId!;

    // Move doc into folder
    await drive.files.update({
      fileId: docId,
      addParents: folderId,
      fields: "id, parents"
    });

    // Insert content
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            insertText: {
              text: content,
              location: { index: 1 }
            }
          }
        ]
      }
    });

    return `https://docs.google.com/document/d/${docId}/edit`;
  }

  async createFormattedNotesDoc(
    title: string,
    classTitle: string,
    dateISO: string,
    refinedTranscript: string,
    notes: NoteSections,
    folderName: string = "Class Notes"
  ) {
    const docs = google.docs({ version: "v1", auth: this.oauth2Client });
    const drive = google.drive({ version: "v3", auth: this.oauth2Client });

    const folderId = await this.ensureFolder(drive, folderName);

    // Create empty doc
    const doc = await docs.documents.create({ requestBody: { title } });
    const docId = doc.data.documentId!;

    // Move doc into folder
    await drive.files.update({
      fileId: docId,
      addParents: folderId,
      fields: "id, parents"
    });

    // Build formatted content with proper Google Docs API requests
    const requests: any[] = [];
    let currentIndex = 1;

    // Helper function to add text and update index
    const addText = (text: string) => {
      requests.push({
        insertText: {
          text,
          location: { index: currentIndex }
        }
      });
      currentIndex += text.length;
    };

    // Helper function to format text as heading
    const formatHeading = (startIndex: number, endIndex: number, headingLevel: number) => {
      requests.push({
        updateParagraphStyle: {
          range: {
            startIndex,
            endIndex
          },
          paragraphStyle: {
            namedStyleType: headingLevel === 1 ? "HEADING_1" : "HEADING_2"
          },
          fields: "namedStyleType"
        }
      });
    };

    // Helper function to format text as bullet list
    const formatBulletList = (startIndex: number, endIndex: number) => {
      requests.push({
        createParagraphBullets: {
          range: {
            startIndex,
            endIndex
          },
          bulletPreset: "BULLET_DISC_CIRCLE_SQUARE"
        }
      });
    };

    // Title and metadata
    const titleText = `${classTitle}\n`;
    addText(titleText);
    formatHeading(1, titleText.length, 1);

    const metaText = `Date: ${dateISO}\n\n`;
    addText(metaText);

    // Add each section with proper formatting
    const sections = [
      { heading: "📝 Introduction", items: notes.introduction },
      { heading: "🔑 Key Concepts", items: notes.keyConcepts },
      { heading: "💡 Explanations", items: notes.explanations },
      { heading: "📚 Definitions", items: notes.definitions },
      { heading: "📋 Summary", items: notes.summary },
      { heading: "❓ Potential Exam Questions", items: notes.examQuestions }
    ];

    for (const section of sections) {
      if (section.items && section.items.length > 0) {
        const sectionHeading = `${section.heading}\n`;
        const sectionStart = currentIndex;
        addText(sectionHeading);
        formatHeading(sectionStart, currentIndex - 1, 2);

        const bulletStart = currentIndex;
        for (const item of section.items) {
          addText(`${item}\n`);
        }
        formatBulletList(bulletStart, currentIndex - 1);
        addText("\n");
      }
    }

    // Transcript section
    if (refinedTranscript && refinedTranscript.trim()) {
      const transcriptHeading = "📄 Full Transcript\n";
      const transcriptStart = currentIndex;
      addText(transcriptHeading);
      formatHeading(transcriptStart, currentIndex - 1, 2);

      addText(`${refinedTranscript}\n`);
    }

    // Apply all formatting in a single batch update
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests
      }
    });

    return `https://docs.google.com/document/d/${docId}/edit`;
  }
}
