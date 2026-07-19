import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { SavedPrompt } from '@domain/types';
import { QuickActions } from './QuickActions';
import { useSettingsStore } from '../../stores/settingsStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeAppSettings } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useSettingsStore);

function makeSavedPrompt(overrides: Partial<SavedPrompt> = {}): SavedPrompt {
  return {
    id: 'sp-1',
    name: 'My Prompt',
    prompt: 'Do the thing.',
    agentName: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderActions(saved: SavedPrompt[] = []) {
  const onSelect = vi.fn();
  const settings = makeAppSettings({ savedPrompts: saved });
  const utils = renderApp(
    <QuickActions agentName="Spark" onSelect={onSelect} disabled={false} />,
    {
      stores: [[useSettingsStore, { settings }]],
      bridge: { settings: { load: vi.fn(async () => settings) } },
    },
  );
  return { ...utils, onSelect };
}

describe('QuickActions', () => {
  it('keeps the menu closed until the trigger is clicked', () => {
    renderActions();
    expect(screen.queryByText('Built-in')).toBeNull();

    fireEvent.click(screen.getByTitle('Quick actions'));
    expect(screen.getByText('Built-in')).toBeInTheDocument();
  });

  it("lists the agent's built-in actions and selects one", () => {
    const { onSelect } = renderActions();
    fireEvent.click(screen.getByTitle('Quick actions'));

    expect(screen.getByText('Pitch me a story')).toBeInTheDocument();
    expect(screen.getByText('I have an idea...')).toBeInTheDocument();
    expect(screen.getByText('Revisit the pitch')).toBeInTheDocument();

    fireEvent.click(screen.getByText('I have an idea...'));
    expect(onSelect).toHaveBeenCalledWith('I have a story idea. Here it is:');
    // Menu closes after selection
    expect(screen.queryByText('Built-in')).toBeNull();
  });

  it('closes the menu on Escape', () => {
    renderActions();
    fireEvent.click(screen.getByTitle('Quick actions'));
    expect(screen.getByText('Built-in')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Built-in')).toBeNull();
  });

  it('filters saved prompts to global ones and ones pinned to this agent', () => {
    renderActions([
      makeSavedPrompt({ id: 'g', name: 'Global prompt', agentName: null }),
      makeSavedPrompt({ id: 's', name: 'Spark prompt', agentName: 'Spark' }),
      makeSavedPrompt({ id: 'v', name: 'Verity prompt', agentName: 'Verity' }),
    ]);
    fireEvent.click(screen.getByTitle('Quick actions'));
    fireEvent.click(screen.getByText('Saved'));

    expect(screen.getByText('Global prompt')).toBeInTheDocument();
    expect(screen.getByText('Spark prompt')).toBeInTheDocument();
    expect(screen.queryByText('Verity prompt')).toBeNull();
  });

  it('uses a saved prompt via its use button', () => {
    const { onSelect } = renderActions([
      makeSavedPrompt({ name: 'Global prompt', prompt: 'Saved text.' }),
    ]);
    fireEvent.click(screen.getByTitle('Quick actions'));
    fireEvent.click(screen.getByText('Saved'));

    fireEvent.click(screen.getByTitle('Use this prompt'));
    expect(onSelect).toHaveBeenCalledWith('Saved text.');
  });

  it('saves a new prompt through the settings store (pinned to the agent)', async () => {
    const { bridge } = renderActions();
    fireEvent.click(screen.getByTitle('Quick actions'));
    fireEvent.click(screen.getByText('Saved'));

    // Save is disabled until both fields are filled
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Name (e.g. Deep Character Revision)'), {
      target: { value: 'Deep Dive' },
    });
    fireEvent.change(screen.getByPlaceholderText('Paste prompt text...'), {
      target: { value: 'Dig into chapter three.' },
    });
    fireEvent.click(screen.getByLabelText('Pin to Spark'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(bridge.settings.update).toHaveBeenCalled());
    const partial = bridge.settings.update.mock.calls[0][0] as {
      savedPrompts: SavedPrompt[];
    };
    expect(partial.savedPrompts).toHaveLength(1);
    expect(partial.savedPrompts[0]).toMatchObject({
      name: 'Deep Dive',
      prompt: 'Dig into chapter three.',
      agentName: 'Spark',
    });
  });

  it('deletes a saved prompt through the settings store', async () => {
    const keep = makeSavedPrompt({ id: 'keep', name: 'Keeper' });
    const drop = makeSavedPrompt({ id: 'drop', name: 'Dropper' });
    const { bridge } = renderActions([keep, drop]);
    fireEvent.click(screen.getByTitle('Quick actions'));
    fireEvent.click(screen.getByText('Saved'));

    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[1]); // Dropper

    await waitFor(() => expect(bridge.settings.update).toHaveBeenCalled());
    const partial = bridge.settings.update.mock.calls[0][0] as {
      savedPrompts: SavedPrompt[];
    };
    expect(partial.savedPrompts.map((p) => p.id)).toEqual(['keep']);
  });

  it('renders the compact chip trigger in compact mode', () => {
    renderApp(
      <QuickActions agentName="Spark" onSelect={vi.fn()} disabled={false} compact />,
      { stores: [[useSettingsStore, { settings: makeAppSettings() }]] },
    );

    expect(screen.getByRole('button', { name: /Quick actions/ })).toBeInTheDocument();
  });
});
