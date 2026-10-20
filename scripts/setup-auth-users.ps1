Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Provisioning akun produksi yang idempotent. Password hanya dikirim langsung
# ke Supabase Auth melalui Admin API dan tidak pernah disimpan di tabel publik.
$DefaultPassword = '12345678'

$EmployeeAccounts = @(
  @{ DisplayName = 'Rakean'; Username = 'rakean'; NIP = '198102082005011003' },
  @{ DisplayName = 'Thoriq'; Username = 'thoriq'; NIP = '199412252022031015' },
  @{ DisplayName = 'Hesti'; Username = 'hesti'; NIP = '197008102007102001' },
  @{ DisplayName = 'Erna'; Username = 'erna'; NIP = '198309252008122002' },
  @{ DisplayName = 'Yusna'; Username = 'yusna'; NIP = '198209242014042001' },
  @{ DisplayName = 'Sucianingsih'; Username = 'sucianingsih'; NIP = '1990031020015042003' },
  @{ DisplayName = 'Entin'; Username = 'entin'; NIP = '196903111990022001' },
  @{ DisplayName = 'Suyadi'; Username = 'suyadi'; NIP = '196907151994031010' },
  @{ DisplayName = 'Drajat'; Username = 'drajat'; NIP = '198102032007011001' },
  @{ DisplayName = 'Sirda'; Username = 'sirda'; NIP = '199204152018012002' },
  @{ DisplayName = 'Linda'; Username = 'linda'; NIP = '199101032025212048' },
  @{ DisplayName = 'Rendy'; Username = 'rendy'; NIP = '199105062025211055' },
  @{ DisplayName = 'Nur'; Username = 'nur'; NIP = '199503102025211034' },
  @{ DisplayName = 'Rifai'; Username = 'rifai'; NIP = '199608292025211031' },
  @{ DisplayName = 'Lina'; Username = 'lina'; NIP = '198602032025212037' },
  @{ DisplayName = 'Mulkirom'; Username = 'mulkirom'; NIP = $null },
  @{ DisplayName = 'Eka'; Username = 'eka'; NIP = $null },
  @{ DisplayName = 'Santika'; Username = 'santika'; NIP = $null },
  @{ DisplayName = 'Vyja'; Username = 'vyja'; NIP = $null },
  @{ DisplayName = 'Ulfi'; Username = 'ulfi'; NIP = $null },
  @{ DisplayName = 'Dhani'; Username = 'dhani'; NIP = $null },
  @{ DisplayName = 'Sendi'; Username = 'sendi'; NIP = $null },
  @{ DisplayName = 'Fajar'; Username = 'fajar'; NIP = $null },
  @{ DisplayName = 'Ferry'; Username = 'ferry'; NIP = $null },
  @{ DisplayName = 'Kamil'; Username = 'kamil'; NIP = $null }
)

function Read-DotEnv([string] $Path) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $idx = $line.IndexOf('=')
    if ($idx -le 0) { continue }
    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    if ($name) { $map[$name] = $value }
  }
  return $map
}

function Resolve-Value($EnvMap, [string[]] $Names, [string] $Fallback = '') {
  foreach ($name in $Names) {
    $processValue = [Environment]::GetEnvironmentVariable($name)
    if ($processValue) { return $processValue.Trim() }
    if ($EnvMap.ContainsKey($name) -and $EnvMap[$name]) { return $EnvMap[$name].Trim() }
  }
  return $Fallback
}

function Invoke-SupabaseJson(
  [string] $Method,
  [string] $Uri,
  $Body = $null,
  [hashtable] $ExtraHeaders = @{}
) {
  $headers = @{
    apikey = $ServiceRoleKey
    Authorization = "Bearer $ServiceRoleKey"
    'Content-Type' = 'application/json'
  }
  foreach ($key in $ExtraHeaders.Keys) { $headers[$key] = $ExtraHeaders[$key] }
  $params = @{ Method = $Method; Uri = $Uri; Headers = $headers }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 10) }
  return Invoke-RestMethod @params
}

function Get-AuthUsers {
  $response = Invoke-SupabaseJson 'GET' "$SupabaseUrl/auth/v1/admin/users?per_page=1000&page=1"
  return @($response.users)
}

function Set-AuthUser(
  [AllowNull()][string] $UserId,
  [string] $Email,
  [string] $Role,
  [string] $Username
) {
  $body = @{
    email = $Email
    password = $DefaultPassword
    email_confirm = $true
    app_metadata = @{ app_role = $Role }
    user_metadata = @{ username = $Username }
  }
  if ($UserId) {
    $user = Invoke-SupabaseJson 'PUT' "$SupabaseUrl/auth/v1/admin/users/$UserId" $body
    return @{ Id = $user.id; Action = 'updated' }
  }
  $user = Invoke-SupabaseJson 'POST' "$SupabaseUrl/auth/v1/admin/users" $body
  return @{ Id = $user.id; Action = 'created' }
}

function Upsert-Role([hashtable] $Row) {
  Invoke-SupabaseJson `
    'POST' `
    "$SupabaseUrl/rest/v1/account_roles?on_conflict=user_id" `
    $Row `
    @{ Prefer = 'resolution=merge-duplicates,return=minimal' } | Out-Null
}

function Update-Employee([string] $Id, [string] $Username, $NIP) {
  $body = @{ username = $Username; nip = $NIP }
  $encodedId = [uri]::EscapeDataString($Id)
  Invoke-SupabaseJson `
    'PATCH' `
    "$SupabaseUrl/rest/v1/employees?id=eq.$encodedId" `
    $body `
    @{ Prefer = 'return=minimal' } | Out-Null
}

$envMap = Read-DotEnv (Join-Path (Get-Location) '.env.local')
$SupabaseUrl = Resolve-Value $envMap @('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
$ServiceRoleKey = Resolve-Value $envMap @('SUPABASE_SERVICE_ROLE_KEY')
$AuthDomain = Resolve-Value $envMap @('AUTH_EMAIL_DOMAIN', 'VITE_AUTH_EMAIL_DOMAIN', 'NEXT_PUBLIC_AUTH_EMAIL_DOMAIN') 'pip.local'

if (-not $SupabaseUrl) { throw 'SUPABASE_URL/VITE_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL belum terisi.' }
if (-not $ServiceRoleKey) { throw 'SUPABASE_SERVICE_ROLE_KEY belum terisi.' }
if ($DefaultPassword.Length -lt 8) { throw 'Password default minimal 8 karakter.' }

Write-Host 'Provisioning 2 akun sistem + 25 akun pegawai...' -ForegroundColor Cyan
Write-Host "Project: $(([uri]$SupabaseUrl).Host)"
Write-Host "Domain Auth internal: $AuthDomain"

$employees = @(Invoke-SupabaseJson 'GET' "$SupabaseUrl/rest/v1/employees?select=id,display_name,username,nip,active&order=sort_order.asc")
$roles = @(Invoke-SupabaseJson 'GET' "$SupabaseUrl/rest/v1/account_roles?select=user_id,role,account_label,employee_id,is_active")
$authUsers = @(Get-AuthUsers)

if ($employees.Count -ne $EmployeeAccounts.Count) {
  throw "Master pegawai berisi $($employees.Count) baris; diharapkan $($EmployeeAccounts.Count). Jalankan migration terlebih dahulu."
}

$employeeByDisplayName = @{}
foreach ($employee in $employees) { $employeeByDisplayName[$employee.display_name.ToLowerInvariant()] = $employee }
$authByEmail = @{}
foreach ($authUser in $authUsers) { if ($authUser.email) { $authByEmail[$authUser.email.ToLowerInvariant()] = $authUser } }

$results = [System.Collections.Generic.List[object]]::new()

# Akun sistem. Utamakan user yang sudah terhubung ke role agar UUID/sesi tetap
# stabil; bila belum ada, gunakan Auth user dengan email tujuan atau buat baru.
foreach ($system in @(
  @{ Username = 'admin'; Role = 'ADMIN' },
  @{ Username = 'user'; Role = 'DEMO' }
)) {
  $email = "$($system.Username)@$AuthDomain".ToLowerInvariant()
  $roleRow = $roles | Where-Object {
    $_.role -eq $system.Role -and $null -eq $_.employee_id -and $_.is_active
  } | Select-Object -First 1
  $authMatch = $authByEmail[$email]
  $userId = if ($roleRow) { $roleRow.user_id } elseif ($authMatch) { $authMatch.id } else { $null }
  $authResult = Set-AuthUser $userId $email $system.Role $system.Username
  Upsert-Role @{
    user_id = $authResult.Id
    role = $system.Role
    account_label = $system.Username
    employee_id = $null
    is_active = $true
    must_change_password = $false
    password_changed_at = $null
    updated_at = [DateTime]::UtcNow.ToString('o')
  }
  $results.Add([pscustomobject]@{ Account = $system.Username; Role = $system.Role; Action = $authResult.Action })
}

foreach ($spec in $EmployeeAccounts) {
  $employee = $employeeByDisplayName[$spec.DisplayName.ToLowerInvariant()]
  if (-not $employee) { throw "Pegawai dengan display name '$($spec.DisplayName)' tidak ditemukan." }
  Update-Employee $employee.id $spec.Username $spec.NIP

  $email = "emp-$($employee.id)@$AuthDomain".ToLowerInvariant()
  $roleRow = $roles | Where-Object { $_.employee_id -eq $employee.id } | Select-Object -First 1
  $authMatch = $authByEmail[$email]
  $userId = if ($roleRow) { $roleRow.user_id } elseif ($authMatch) { $authMatch.id } else { $null }
  $authResult = Set-AuthUser $userId $email 'EMPLOYEE' $spec.Username
  Upsert-Role @{
    user_id = $authResult.Id
    role = 'EMPLOYEE'
    account_label = $spec.Username
    employee_id = $employee.id
    is_active = $true
    must_change_password = $false
    password_changed_at = $null
    updated_at = [DateTime]::UtcNow.ToString('o')
  }
  $results.Add([pscustomobject]@{ Account = $spec.Username; Role = 'EMPLOYEE'; Action = $authResult.Action })
}

# Verifikasi query: seluruh username/NIP dan role harus tepat setelah upsert.
$verifiedEmployees = @(Invoke-SupabaseJson 'GET' "$SupabaseUrl/rest/v1/employees?select=id,display_name,username,nip&order=sort_order.asc")
$verifiedRoles = @(Invoke-SupabaseJson 'GET' "$SupabaseUrl/rest/v1/account_roles?select=user_id,role,account_label,employee_id,is_active,must_change_password")

foreach ($spec in $EmployeeAccounts) {
  $row = $verifiedEmployees | Where-Object { $_.display_name -eq $spec.DisplayName } | Select-Object -First 1
  if (-not $row -or $row.username -ne $spec.Username -or $row.nip -ne $spec.NIP) {
    throw "Verifikasi username/NIP gagal untuk '$($spec.DisplayName)'."
  }
  $role = $verifiedRoles | Where-Object { $_.employee_id -eq $row.id } | Select-Object -First 1
  if (-not $role -or $role.role -ne 'EMPLOYEE' -or -not $role.is_active -or $role.must_change_password) {
    throw "Verifikasi role gagal untuk '$($spec.DisplayName)'."
  }
}

foreach ($system in @(@{ Username = 'admin'; Role = 'ADMIN' }, @{ Username = 'user'; Role = 'DEMO' })) {
  $role = $verifiedRoles | Where-Object {
    $_.account_label -eq $system.Username -and $_.role -eq $system.Role -and $null -eq $_.employee_id
  } | Select-Object -First 1
  if (-not $role -or -not $role.is_active -or $role.must_change_password) {
    throw "Verifikasi role gagal untuk akun sistem '$($system.Username)'."
  }
}

$created = @($results | Where-Object { $_.Action -eq 'created' }).Count
$updated = @($results | Where-Object { $_.Action -eq 'updated' }).Count
Write-Host ''
Write-Host "Selesai dan terverifikasi: $created dibuat, $updated diperbarui." -ForegroundColor Green
$results | Format-Table -AutoSize
Write-Host 'Password tidak dicetak dan tidak disimpan di tabel aplikasi.'
