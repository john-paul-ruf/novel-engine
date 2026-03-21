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
            // Ignore events for sessions that don't belong to the currently-loaded plan.
            // This prevents a running queue for Book A from setting isRunning=true
            // when the user has switched to Book B's queue.
            const belongsToCurrentPlan = state.plan.sessions.some(s => s.id === event.sessionId);
            if (!belongsToCurrentPlan) return state;

            const sessions = state.plan.sessions.map(s =>
              s.id === event.sessionId
                ? {
                    ...s,
                    status: event.status,
                    // Persist the conversationId when the backend sends it (on 'running')
                    ...(event.conversationId ? { conversationId: event.conversationId } : {}),
                  }
                : s
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
          // Only reset running state if this event belongs to the currently-loaded plan.
          // Without this check, Book A finishing would stomp Book B's isRunning flag.
          const doneState = useRevisionQueueStore.getState();
          if (doneState.planId === event.planId) {
            useRevisionQueueStore.setState({
              isRunning: false,
              isPaused: false,
            });
          }
          break;
        }

        case 'queue:archived': {
          const archiveState = useRevisionQueueStore.getState();
          if (archiveState.planId === event.planId) {
            useRevisionQueueStore.setState({
              isArchiving: false,
              isQueueArchived: true,
              // Clear the in-memory plan — source files are archived, pipeline will advance.
              // The user will see the pipeline move forward when they navigate away.
              plan: null,
              planId: null,
            });
          }
          break;
        }

        case 'error': {
          // Only update if the erroring session belongs to the current plan
          const errState = useRevisionQueueStore.getState();
          const errorBelongs = errState.plan?.sessions.some(s => s.id === event.sessionId);
          if (errorBelongs) {
            useRevisionQueueStore.setState({
              error: event.message,
              isRunning: false,
            });
          }
          break;
        }
      }
    });

    return cleanup;
  }, []);
}
