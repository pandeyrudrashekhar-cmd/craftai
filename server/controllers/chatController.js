import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { generateChatResponse } from '../services/aiService.js';
import { validateEditingResponse, enrichChangeMetadata } from '../services/phase6EditingService.js';
import { calculateDiff } from '../utils/diffUtils.js';
import { AppError } from '../utils/appError.js';
import { limits } from '../config/limits.js';

const CONTEXT_MESSAGE_LIMIT = 20;
const messageSchema = z.object({ message: z.string().trim().min(1, 'Message cannot be empty.').max(limits.maxPromptCharacters) });
const projectSelect = { id: true, title: true, description: true, framework: true };
const messageSelect = { id: true, role: true, content: true, createdAt: true };
const presentMessage = (message) => ({ ...message, role: message.role.toLowerCase() });
const pathSchema = z.string().trim().min(1).max(255).refine((path) => !path.startsWith('/') && !path.includes('\\') && !path.split('/').some((part) => !part || part === '.' || part === '..'), 'AI returned an invalid file path.');
const aiResponseSchema = z.object({ message: z.string().trim().min(1).max(limits.maxPromptCharacters), changes: z.array(z.object({ path: pathSchema, content: z.string().max(limits.maxFileBytes), language: z.string().trim().min(1).max(40).optional() })).max(20).default([]) }).strict();

async function findOwnedProject(database, projectId, userId) {
  const project = await database.project.findFirst({ where: { id: projectId, userId }, select: projectSelect });
  if (!project) throw new AppError('Project not found.', 404);
  return project;
}

function detectEditingMode(userMessage, projectFiles) {
  const editingKeywords = [
    'fix', 'refactor', 'improve', 'optimize', 'clean up', 'remove', 'update', 'change', 'modify',
    'add dark', 'add light', 'make.*sticky', 'make.*responsive', 'debug', 'error', 'bug',
    'enhance', 'restructure', 'reorganize', 'consolidate', 'simplify', 'convert.*to'
  ];
  
  const hasEditingKeyword = editingKeywords.some(keyword => 
    new RegExp(keyword, 'i').test(userMessage)
  );
  
  const hasExistingFiles = projectFiles && projectFiles.length > 0;
  
  return hasEditingKeyword && hasExistingFiles;
}

function buildAiMessages(project, files, messages, editingMode = false) {
  const projectFiles = files.map((file) => `--- ${file.path} ---\n${file.content}`).join('\n\n');
  
  let promptContent;
  if (editingMode) {
    promptContent = `You are an AI code editor for CraftAI. Make TARGETED, SURGICAL edits to existing project files.

KEY RULES FOR EDITING:
1. Identify ONLY files that need changes - do not regenerate unrelated files
2. Preserve working code - never replace an entire file for one small change
3. Make minimal targeted edits to accomplish the goal
4. Support refactoring: "refactor component", "remove duplicate code", "improve structure"
5. Support bug fixing: "fix login button", "fix error", "fix navbar"

RETURN FORMAT (JSON): {"message":"brief summary","changes":[{"path":"file/path.jsx","content":"complete updated content","language":"jsx"}]}

RULES: Return complete file contents (never patches). Use relative paths (no /, \\, .., .). src/App.jsx must be valid React (export default function App() { return (...); }). Use className not class, {/* */} not <!-- -->. No <html>/<head>/<body>. No Tailwind: use inline styles or update src/index.css. Never modify src/main.jsx or package.json unless explicitly requested. No markdown fences in JSON.`;
  } else {
    promptContent = `You are the AI assistant for CraftAI. Implement website requests by returning JSON: {"message":"short summary","changes":[{"path":"relative/path","content":"complete content","language":"optional"}]}. Return complete file contents (never patches). Use relative paths (no /, \\, .., .). For requests needing no edits, return empty changes array.

src/App.jsx rule: must be valid React JSX: export default function App() { return (...); }. Never raw HTML or complete HTML document. Use className not class, {/* */} not <!-- -->. No <html>, <head>, <body>. No Tailwind classes. Update src/index.css for styling. Do not modify src/main.jsx or package.json for normal generation. No markdown fences.`;
  }

  const projectContext = `${promptContent}

Project: ${project.title}
Description: ${project.description || 'Not provided'}
Framework: ${project.framework}

Files:
${projectFiles || '(No files yet)'}`;
  
  return [{ role: 'system', content: projectContext }, ...messages.map((message) => ({ role: message.role.toLowerCase(), content: message.content }))];
}

function parseMessage(body) { 
  try { 
    return messageSchema.parse(body).message; 
  } catch (error) { 
    if (error instanceof z.ZodError) throw new AppError(error.issues[0].message, 400); 
    throw error; 
  } 
}

export function validateAppJsxRequest(content) {
  if (!/(?:\bsrc\s*\/\s*)?\bApp\.jsx\b/i.test(content)) return;
  if (/<!--[\s\S]*?-->/.test(content)) throw new AppError('Cannot apply this change because src/App.jsx requires valid React JSX comments ({/* ... */}), not HTML comments (<!-- ... -->). No project files were changed.', 400);
  if (/<\s*\/?\s*(?:html|head|body)\b/i.test(content) || /\b(?:raw|full|standalone)\s+html\b/i.test(content)) throw new AppError('Cannot apply this change because src/App.jsx requires valid React JSX, not raw HTML or a full HTML document. No project files were changed.', 400);
}

function removeCodeFence(content) {
  const fenced = content.match(/^\s*```(?:jsx|javascript|js|tsx|typescript|css|json|html)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  return fenced ? fenced[1] : content;
}

export function normalizeGeneratedChanges(changes) { 
  return changes.map((change) => ({ ...change, content: removeCodeFence(change.content) })); 
}

function withoutStringLiterals(source) {
  let result = ''; 
  let quote = null; 
  let escaped = false;
  for (const character of source) {
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      result += ' ';
    } else if (character === '"' || character === "'" || character === '`') {
      quote = character; 
      result += ' ';
    } else result += character;
  }
  return result;
}

function appValidationError(source) {
  if (!source.trim()) return 'The AI generated an empty src/App.jsx.';
  const code = withoutStringLiterals(source);
  if (/<!--|-->/.test(code)) return 'The AI generated HTML comments in src/App.jsx, which are invalid JSX.';
  if (/<\/?(?:html|head|body)\b/i.test(code)) return 'The AI generated a full HTML document in src/App.jsx.';
  if (/\bclass\s*=/.test(code)) return 'The AI used HTML class attributes in src/App.jsx; React requires className.';
  if (!/export\s+default\s+function\s+App\s*\(/.test(code) || !/\breturn\s*(?:\(|<)/.test(code)) return 'The AI returned src/App.jsx without a complete default App component.';
  return null;
}

export function validateGeneratedReactFiles(changes) {
  const appChange = changes.find((change) => change.path === 'src/App.jsx');
  const error = appChange && appValidationError(appChange.content);
  if (error) throw new AppError(`AI generated invalid React source for src/App.jsx. ${error} No project files were changed.`, 502);
}

export function createChatHandlers({ database = prisma, generateResponse = generateChatResponse } = {}) {
  async function getChat(request, response, next) {
    try {
      await findOwnedProject(database, request.params.id, request.auth.userId);
      const conversation = await database.conversation.findFirst({ 
        where: { projectId: request.params.id }, 
        orderBy: { updatedAt: 'desc' }, 
        include: { messages: { select: messageSelect, orderBy: { createdAt: 'asc' } } } 
      });
      response.status(200).json({ 
        conversation: conversation ? { 
          id: conversation.id, 
          messages: conversation.messages.map(presentMessage) 
        } : { 
          id: null, 
          messages: [] 
        } 
      });
    } catch (error) { 
      next(error); 
    }
  }

  async function sendChat(request, response, next) {
    try {
      const content = parseMessage(request.body);
      const project = await findOwnedProject(database, request.params.id, request.auth.userId);
      validateAppJsxRequest(content);
      
      let conversation = await database.conversation.findFirst({ 
        where: { projectId: project.id }, 
        orderBy: { updatedAt: 'desc' } 
      });
      if (!conversation) {
        conversation = await database.conversation.create({ 
          data: { projectId: project.id } 
        });
      }
      
      const userMessage = await database.conversation.update({ 
        where: { id: conversation.id }, 
        data: { messages: { create: { role: 'USER', content } } }, 
        select: { messages: { select: messageSelect, orderBy: { createdAt: 'desc' }, take: 1 } } 
      });
      
      const [history, files] = await Promise.all([
        database.message.findMany({ 
          where: { conversationId: conversation.id }, 
          select: { role: true, content: true, createdAt: true }, 
          orderBy: { createdAt: 'desc' }, 
          take: CONTEXT_MESSAGE_LIMIT 
        }), 
        database.projectFile.findMany({ 
          where: { projectId: project.id }, 
          select: { id: true, path: true, content: true, language: true }, 
          orderBy: { path: 'asc' } 
        })
      ]);
      
      // Detect editing mode (Phase 6)
      const editingMode = detectEditingMode(content, files);
      
      // Build messages and get AI response
      const messages = buildAiMessages(project, files, history.reverse(), editingMode);
      const rawResponse = await generateResponse(messages);
      
      let aiResponse;
      try { 
        aiResponse = aiResponseSchema.parse(rawResponse); 
      } catch (error) { 
        if (error instanceof z.ZodError) throw new AppError('The AI provider returned an invalid file-change response. Please try again.', 502); 
        throw error; 
      }
      
      aiResponse = { ...aiResponse, changes: normalizeGeneratedChanges(aiResponse.changes) };
      
      // Validate editing mode constraints
      if (editingMode) {
        validateEditingResponse(aiResponse.changes, project.id);
      }
      
      if (new Set(aiResponse.changes.map((change) => change.path)).size !== aiResponse.changes.length) {
        throw new AppError('The AI provider returned duplicate file changes. Please try again.', 502);
      }
      
      validateGeneratedReactFiles(aiResponse.changes);
      
      // Enrich changes with diff metadata
      const enrichedChanges = enrichChangeMetadata(aiResponse.changes, files);
      const changeMetadata = enrichedChanges.map(c => ({
        path: c.path,
        type: c.editType,
        isNew: c.isNew,
        diff: c.editType !== 'created' ? calculateDiff(c.oldContent || '', c.newContent || '') : null
      }));
      
      const result = await database.$transaction(async (transaction) => {
        const updatedFiles = [];
        for (const change of aiResponse.changes) {
          updatedFiles.push(
            await transaction.projectFile.upsert({
              where: { projectId_path: { projectId: project.id, path: change.path } },
              update: { 
                content: change.content, 
                ...(change.language ? { language: change.language } : {}) 
              },
              create: { 
                projectId: project.id, 
                path: change.path, 
                content: change.content, 
                language: change.language ?? null 
              },
              select: { id: true, path: true, content: true, language: true, createdAt: true, updatedAt: true }
            })
          );
        }
        
        const assistant = await transaction.conversation.update({
          where: { id: conversation.id },
          data: { messages: { create: { role: 'ASSISTANT', content: aiResponse.message } } },
          select: { messages: { select: messageSelect, orderBy: { createdAt: 'desc' }, take: 1 } }
        });
        
        return { updatedFiles, assistantMessage: assistant.messages[0], changeMetadata, editingMode };
      });
      
      response.status(201).json({ 
        conversationId: conversation.id, 
        userMessage: presentMessage(userMessage.messages[0]), 
        message: presentMessage(result.assistantMessage), 
        files: result.updatedFiles,
        editing: result.editingMode,
        changes: result.changeMetadata
      });
    } catch (error) { 
      next(error); 
    }
  }

  return { getChat, sendChat };
}

const defaultHandlers = createChatHandlers();
export const getChat = defaultHandlers.getChat;
export const sendChat = defaultHandlers.sendChat;
