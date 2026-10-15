import type { PrismaClient } from '@prisma/client';
import { buildAnswerContext, createAnswerSelector, renderSelection, type Citation, type SelectAnswer } from './answerer.ts';
import { createRetriever, QuestionSchema, SearchOptionsSchema, type Retrieve, type RetrievalRequest } from './retriever.ts';

export type PolicyAnswer = {
  status: 'answered' | 'not_covered' | 'not_ready' | 'provider_unavailable' | 'invalid_answer';
  answer: string;
  citations: Citation[];
  warnings: string[];
  code?: string;
};

export function createPolicyAssistant(dependencies: { retrieve: Retrieve; selectAnswer?: SelectAnswer }) {
  const selector = dependencies.selectAnswer ?? createAnswerSelector();
  return async ({ question, options = {} }: RetrievalRequest): Promise<PolicyAnswer> => {
    // Invalid input must fail before any database or provider work.
    const query = QuestionSchema.parse(question);
    const settings = SearchOptionsSchema.parse(options);
    let retrieval;
    try { retrieval = await dependencies.retrieve({ question: query, options: settings }); }
    catch {
      return { status: 'provider_unavailable', code: 'RAG_RETRIEVAL_UNAVAILABLE',
        answer: 'Policy search is temporarily unavailable. Please contact RCS Travels support.', citations: [], warnings: [] };
    }
    if (retrieval.status === 'not_ready') {
      return { status: 'not_ready', code: 'RAG_CORPUS_NOT_LOADED',
        answer: 'The policy knowledge base has not been loaded yet. Please contact RCS Travels support.', citations: [], warnings: [] };
    }
    if (!retrieval.matches.length) {
      return { status: 'not_covered', answer: 'No sufficiently relevant policy passage was found. Please contact RCS Travels support.', citations: [], warnings: [] };
    }
    const context = buildAnswerContext(query, settings.audience, retrieval.matches);
    if (!context.passages.length) {
      return { status: 'not_covered', answer: 'The retrieved sections contain no policy evidence. Please contact RCS Travels support.', citations: [], warnings: [] };
    }
    let selection;
    try { selection = await selector(context); }
    catch {
      return { status: 'provider_unavailable', code: 'RAG_ANSWER_UNAVAILABLE',
        answer: 'Policy answers are temporarily unavailable. Please contact RCS Travels support.', citations: [], warnings: [] };
    }
    const rendered = renderSelection(context, selection);
    return rendered ?? { status: 'invalid_answer', code: 'RAG_ANSWER_REJECTED',
      answer: 'A supported policy answer could not be verified. Please contact RCS Travels support.', citations: [], warnings: [] };
  };
}

export function createDatabasePolicyAssistant(db: PrismaClient) {
  return createPolicyAssistant({ retrieve: createRetriever(db) });
}
