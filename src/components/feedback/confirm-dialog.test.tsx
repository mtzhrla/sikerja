import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
import { ConfirmProvider, useConfirm } from './confirm-dialog';

function Harness({ onResult }: { onResult: (v: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <Button
      onClick={async () => {
        const ok = await confirm({
          title: 'Hapus step?',
          description: 'Tindakan ini dapat dipulihkan Admin.',
          danger: true,
          confirmLabel: 'Hapus',
        });
        onResult(ok);
      }}
    >
      Picu
    </Button>
  );
}

describe('ConfirmProvider', () => {
  it('mengembalikan true saat dikonfirmasi', async () => {
    let result: boolean | null = null;
    render(
      <ConfirmProvider>
        <Harness onResult={(v) => (result = v)} />
      </ConfirmProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Picu' }));
    expect(await screen.findByText('Hapus step?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hapus' }));
    expect(result).toBe(true);
  });

  it('mengembalikan false saat dibatalkan', async () => {
    let result: boolean | null = null;
    render(
      <ConfirmProvider>
        <Harness onResult={(v) => (result = v)} />
      </ConfirmProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Picu' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Batal' }));
    expect(result).toBe(false);
  });
});
