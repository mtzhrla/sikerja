import * as Dropdown from '@radix-ui/react-dropdown-menu';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const DropdownRoot = Dropdown.Root;
export const DropdownTrigger = Dropdown.Trigger;

export function DropdownContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Dropdown.Content>) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content
        align="end"
        sideOffset={6}
        collisionPadding={8}
        className={cn(
          'z-50 min-w-44 rounded-xl border border-slate-100 bg-white p-1.5 shadow-(--shadow-pop)',
          'animate-fade-in-up',
          className,
        )}
        {...props}
      >
        {children}
      </Dropdown.Content>
    </Dropdown.Portal>
  );
}

interface DropdownItemProps extends ComponentProps<typeof Dropdown.Item> {
  icon?: ReactNode;
  danger?: boolean;
}

export function DropdownItem({ className, icon, danger, children, ...props }: DropdownItemProps) {
  return (
    <Dropdown.Item
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium outline-none select-none',
        danger
          ? 'text-danger-600 data-highlighted:bg-danger-50'
          : 'text-slate-700 data-highlighted:bg-slate-100',
        'data-disabled:cursor-not-allowed data-disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {icon && (
        <span aria-hidden className="[&>svg]:size-4">
          {icon}
        </span>
      )}
      {children}
    </Dropdown.Item>
  );
}

export function DropdownSeparator() {
  return <Dropdown.Separator className="my-1 h-px bg-slate-100" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <Dropdown.Label className="px-2.5 pt-1.5 pb-1 text-[11px] font-bold tracking-wide text-slate-400 uppercase">
      {children}
    </Dropdown.Label>
  );
}
