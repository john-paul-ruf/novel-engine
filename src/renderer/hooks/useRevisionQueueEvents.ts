import { useEffect } from 'react';
import { useRevisionQueueStore } from '../stores/revisionQueueStore';
import { useFileChangeStore } from '../stores/fileChangeStore';
import { useBookStore } from '../stores/bookStore';
import type { RevisionQueueEvent } from '@domain/types';

export function useRevisionQueueEvents() {
  useEffect(() => {
    const cleanup = window.novelEngine.revision.onEvent((event: RevisionQueueEvent) => {
      switch (event.type) {
        case 'session:status': {
          useRevisionQueueStore.setState(state => {
            if (!state.plan) return state;
            const sessions = state.plan.sessions.map(s =>
              s.id === event.sessionId ? { ...s, status: event.status } : s
            );
            const update: Partial<typeof state> & { plan: typeof state.plan } = {
              plan: { ...state.plan, sessions },
            };
            if (event.status === 'running') {
              update.activeSessionId = event.sessionId;
              update.viewingSessionId = event.sessionId;
              update.streamingResponse = '';
              update.streamingThinking = '';
              update.isRunning = true;
            }
            return update;
          });
          break;
        }

        case 'session:chunk': {
          useRevisionQueueStore.setState(state => ({
            streamingResponse: state.streamingResponse + event.text,
          }));
          break;
        }

        case 'session:thinking': {
          useRevisionQueueStore.setState(state => ({
            streamingThinking: state.streamingThinking + event.text,
          }));
          break;
        }

        case 'session:gate': {
          const state = useRevisionQueueStore.getState();
          const session = state.plan?.sessions.find(s => s.id === event.sessionId);
          const convId = session?.conversationId;

          useRevisionQueueStore.setState({
            gateSessionId: event.sessionId,
            gateText: event.gateText,
            viewingSessionId: event.sessionId,
          });

          if (convId) {
            useRevisionQueueStore.getState().loadPanelMessages(convId);
          }
          break;
        }

        case 'session:done': {
          const state = useRevisionQueueStore.getState();
          const session = state.plan?.sessions.find(s => s.id === event.sessionId);
          const convId = session?.conversationId;

          useRevisionQueueStore.setState(state => {
            if (!state.plan) return state;
            const completedTaskNumbers = [
              ...state.plan.completedTaskNumbers,
              ...event.taskNumbers.filter(n => !state.plan!.completedTaskNumbers.includes(n)),
            ];
            return {
              plan: { ...state.plan, completedTaskNumbers },
              activeSessionId: null,
              streamingResponse: '',
              streamingThinking: '',
            };
          });

          if (convId) {
            useRevisionQueueStore.getState().loadPanelMessages(convId);
          }

          useFileChangeStore.getState().notifyChange();
          useBookStore.getState().refreshWordCount();
          break;
        }

        case 'plan:loading-step': {
          useRevisionQueueStore.setState({ loadingStep: event.step });
          break;
        }

        case 'plan:progress': {
          break;
        }

        case 'queue:done': {
          useRevisionQueueStore.setState({
            isRunning: false,
            isPaused: false,
          });
          break;
        }

        case 'queue:archived': {
          useRevisionQueueStore.setState({
            isArchiving: false,
            isQueueArchived: true,
            // Clear the in-memory plan — source files are archived, pipeline will advance.
            // The user will see the pipeline move forward when they navigate away.
            plan: null,
            planId: null,
          });
          break;
        }

        case 'error': {
          useRevisionQueueStore.setState({
            error: event.message,
            isRunning: false,
          });
          break;
        }
      }
    });

    return cleanup;
  }, []);
}
