import { generateChatResponse } from './aiService.js';
import { AppError } from '../utils/appError.js';

const EDITING_SYSTEM_PROMPT = `You are an AI code editor for CraftAI, an AI website builder. Your task is to make TARGETED, SURGICAL edits to existing project files based on user requests.

KEY RULES FOR EDITING MODE:
1. IDENTIFY AFFECTED FILES: Analyze the user's request and identify ONLY the files that need changes. Do not regenerate unrelated files.
2. PRESERVE WORKING CODE: Keep all code that doesn't need to change. Never replace a working file just to make one small change.
3. MINIMAL CHANGES: Make the smallest possible edits to accomplish the goal. If the user asks to "add dark mode", identify the specific files (usually App.jsx and index.css) that need changes, not the entire project.
4. REFACTORING SUPPORT: Support requests like "refactor this component", "remove duplicate code", "improve structure" by intelligently reorganizing code while preserving functionality.
5. BUG FIXING: Support requests like "fix the login button", "fix this error", "fix the navbar" by identifying the problematic code and fixing only that issue.

RETURN FORMAT: Always return JSON with this exact structure:
{
  "message": "brief summary of changes made (max 100 chars)",
  "changes": [
    {
      "path": "file/path.jsx",
      "content": "complete updated file content",
      "language": "jsx",
      "editType": "refactor|bugfix|feature|style|other"
    }
  ]
}

IMPORTANT CONSTRAINTS:
- Return COMPLETE file contents for changed files, never patches or diffs
- Use relative paths with no leading slash, backslashes, or . / .. segments
- Only include files that actually need to change
- For src/App.jsx: must be valid React JSX: export default function App() { return (...); }
- Use className not class, {/* */} comments not <!-- -->, no <html>/<head>/<body>
- Tailwind is not installed: use inline styles or update src/index.css
- Never modify src/main.jsx or package.json unless explicitly requested
- Do not include markdown fences or extra keys in JSON

FILE CONTEXT: You have access to the current project files below. Analyze them to understand the structure, then make your edits.`;

function buildEditingContext(project, files, existingChanges = null) {
  const projectFiles = files
    .map((file) => `--- ${file.path} ---\n${file.content}`)
    .join('\n\n');

  const editingContext = `${EDITING_SYSTEM_PROMPT}

Project title: ${project.title}
Description: ${project.description || 'Not provided'}
Framework: ${project.framework}

Current project files:
${projectFiles || '(No files yet)'}

${
  existingChanges
    ? `\nPrevious changes in this conversation:\n${existingChanges.map((c) => `- ${c.path}: ${c.editType || 'modified'}`).join('\n')}`
    : ''
}`;

  return editingContext;
}

export async function generateEditingResponse(project, files, userMessage, conversationHistory = [], previousChanges = []) {
  const messages = [
    { role: 'system', content: buildEditingContext(project, files, previousChanges) },
    ...conversationHistory.map((msg) => ({ role: msg.role.toLowerCase(), content: msg.content })),
    { role: 'user', content: userMessage }
  ];

  return generateChatResponse(messages);
}

export function validateEditingResponse(changes, projectId) {
  // Ensure no path traversal
  for (const change of changes) {
    if (
      change.path.startsWith('/') ||
      change.path.includes('\\') ||
      change.path.includes('..') ||
      change.path.split('/').some((part) => !part || part === '.')
    ) {
      throw new AppError(
        `Invalid file path "${change.path}". Use relative paths without leading slashes or traversal segments.`,
        400
      );
    }
  }

  // Ensure at least one change (but allow empty changes array for responses that don't need edits)
  // This is actually fine - some prompts shouldn't result in changes
  return true;
}

export function enrichChangeMetadata(changes, oldFiles) {
  return changes.map((change) => {
    const oldFile = oldFiles?.find((f) => f.path === change.path);
    const isNew = !oldFile;
    const isDelete = !change.content;

    return {
      ...change,
      editType: change.editType || (isNew ? 'created' : isDelete ? 'deleted' : 'modified'),
      isNew,
      isDelete,
      oldContent: oldFile?.content || null
    };
  });
}
