import { useEffect } from 'react';
import { useRevisionQueueStore } from '../stores/revisionQueueStore';
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
            return {
              plan: { ...state.plan, sessions },
              isRunning: event.status === 'running',
              activeSessionId: event.status === 'running' ? event.sessionId : state.activeSessionId,
            };
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
          useRevisionQueueStore.setState({
            gateSessionId: event.sessionId,
            gateText: event.gateText,
          });
          break;
        }

        case 'session:done': {
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
          break;
        }

        case 'plan:progress': {
          // Plan state already synced via session:done — no action needed
          break;
        }

        case 'queue:done': {
          useRevisionQueueStore.setState({
            isRunning: false,
            isPaused: false,
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
