import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('meneruskan klik saat aktif', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Simpan</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('loading menonaktifkan tombol dan mencegah klik', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Menyimpan
      </Button>,
    );
    const btn = screen.getByRole('button', { name: /menyimpan/i });
    expect(btn).toBeDisabled();
    await userEvent.click(btn).catch(() => undefined);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('default type=button (tidak submit form tanpa sengaja)', () => {
    render(<Button>Aksi</Button>);
    expect(screen.getByRole('button', { name: 'Aksi' })).toHaveAttribute('type', 'button');
  });
});
