import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Icon, type IconName } from './Icon';

const ALL_NAMES: IconName[] = [
  'logo', 'library', 'workspace', 'manuscript', 'exports',
  'statistics', 'settings', 'search', 'send', 'check',
  'chevronDown', 'chevronRight', 'chevronUp', 'plus', 'bulb',
  'play', 'eye', 'pencil', 'download', 'x', 'history', 'sparkles', 'mail',
];

describe('Icon', () => {
  it('renders an aria-hidden 19px svg by default', () => {
    const { container } = render(<Icon name="check" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '19');
    expect(svg).toHaveAttribute('height', '19');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
  });

  it('applies size, strokeWidth and className overrides', () => {
    const { container } = render(<Icon name="search" size={12} strokeWidth={2} className="text-red" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '12');
    expect(svg).toHaveAttribute('height', '12');
    expect(svg).toHaveAttribute('stroke-width', '2');
    expect(svg).toHaveClass('text-red');
  });

  it('renders drawable content for every icon name', () => {
    for (const name of ALL_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      expect(
        container.querySelector('svg path, svg circle, svg rect'),
        `icon "${name}" has no drawable content`,
      ).not.toBeNull();
      unmount();
    }
  });
});
