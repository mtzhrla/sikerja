import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from './field';
import { Input } from './input';

describe('Field', () => {
  it('menghubungkan label ke kontrol (aksesibilitas)', () => {
    render(
      <Field label="Nama pekerjaan">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Nama pekerjaan')).toBeInTheDocument();
  });

  it('menampilkan error sebagai alert dan menandai kontrol invalid', () => {
    render(
      <Field label="Kategori" error="Kategori wajib dipilih.">
        <Input />
      </Field>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Kategori wajib dipilih.');
    expect(screen.getByLabelText('Kategori')).toHaveAttribute('aria-invalid', 'true');
  });

  it('menampilkan hint saat tidak ada error', () => {
    render(
      <Field label="Judul" hint="Maksimal 120 karakter.">
        <Input />
      </Field>,
    );
    expect(screen.getByText('Maksimal 120 karakter.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
