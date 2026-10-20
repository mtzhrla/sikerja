-- Allow employee-linked accounts to carry either the regular user or admin role.
alter table public.account_roles drop constraint if exists account_roles_employee_link;
alter table public.account_roles
  add constraint account_roles_employee_link
  check (
    (role in ('EMPLOYEE', 'ADMIN') and employee_id is not null)
    or (role = 'DEMO' and employee_id is null)
  );
