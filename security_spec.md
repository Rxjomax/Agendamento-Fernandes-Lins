# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Catch-All**: All paths not explicitly matched are denied (`allow read, write: if false;`).
2. **Verified Identity**: All authenticated operations require `request.auth != null && request.auth.token.email_verified == true`.
3. **Master / Admin Verification**: Master privileges are granted only if the authenticated user exists in `/admins/$(request.auth.uid)` or is the bootstrapped runtime owner email (`jm783311@gmail.com`) with `email_verified == true`.
4. **Legal Practice Areas (`/services/{serviceId}`)**:
   - `get` and `list` require a signed-in verified user (`resource.data.status in ['active', 'inactive']`).
   - Only `isAdmin()` (Master) can `create`, `update`, or `delete` areas/attorneys.
   - `serviceId` must match `isValidId(serviceId)` and equal `incoming().id`.
   - `createdAt` is immutable on update and must equal `request.time` on create; `updatedAt` must equal `request.time`.
5. **Appointments (`/appointments/{appointmentId}`)**:
   - `get` and `list` are restricted to the appointment creator (`resource.data.ownerId == request.auth.uid`) or `isAdmin()` (Master).
   - `create` requires `incoming().ownerId == request.auth.uid`, valid `serviceId` existing in `/services/$(incoming().serviceId)`, strict key/type/size validation (including `clientCpf`, `clientAddress`, `descriptionMode`, `caseDescription`, `briefSubject`).
   - `update` enforces terminal state locking (`existing().status != 'cancelled'` unless `isAdmin()`), immutable `id`, `code`, `serviceId`, `ownerId`, and `createdAt`, and action-based `affectedKeys().hasOnly(...)`.
6. **PII Isolation (`/users/{userId}/private/{docId}`)**:
   - Strictly isolated to `request.auth.uid == userId || isAdmin()`.
   - Self-assigned roles are forbidden (`role` is not an allowed key in `UserPrivateProfile`).

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth = null` attempting to create `/appointments/apt-1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: 'u1', token: { email: 'jm783311@gmail.com', email_verified: false } }` attempting to create `/services/srv-1` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection on Create**: Creating `/appointments/apt-1` with extra key `isAdmin: true` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection on Update**: Updating `/appointments/apt-1` with unapproved field `price: 0` by non-master -> `PERMISSION_DENIED`.
5. **Identity Spoofing on Create**: User `u1` creating `/appointments/apt-1` with `ownerId: 'u2'` -> `PERMISSION_DENIED`.
6. **Owner Immutability Violation**: User `u1` updating `ownerId` to `'u2'` on `/appointments/apt-1` -> `PERMISSION_DENIED`.
7. **Terminal State Bypass**: User `u1` updating `/appointments/apt-1` when `existing().status == 'cancelled'` -> `PERMISSION_DENIED`.
8. **ID Poisoning / Oversized String**: Creating `/services/srv-1` with a 2000-char `name` -> `PERMISSION_DENIED`.
9. **Orphaned Foreign Key**: Creating `/appointments/apt-1` referencing a non-existent `/services/non-existent` -> `PERMISSION_DENIED`.
10. **PII Cross-Read**: User `u2` attempting `get` on `/users/u1/private/info` -> `PERMISSION_DENIED`.
11. **Unrestricted List Scraping**: User `u2` attempting `list` on `/appointments` without `where('ownerId', '==', 'u2')` -> `PERMISSION_DENIED`.
12. **Client Timestamp Forgery**: Creating `/appointments/apt-1` with forged `createdAt` != `request.time` -> `PERMISSION_DENIED`.
