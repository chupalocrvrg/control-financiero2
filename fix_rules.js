import fs from 'fs';
let rules = fs.readFileSync('firestore.rules', 'utf8');
const target = `    match /users/{userId} {
      allow get: if isOwnerOrAdmin(userId);
      allow list: if isAdmin();
      
      allow create: if isOwnerOrAdmin(userId) && isValidUser(incoming()) && 
                     (
                      isAdmin() || 
                       (incoming().role == 'USER' && incoming().status == 'ENABLED') ||
                      (incoming().role == 'SUPERADMIN' && incoming().status == 'ENABLED' && isSuperAdminFallback())
                    ) &&
                    incoming().createdAt == request.time;
      
      allow update: if isOwnerOrAdmin(userId) && (
        isAdmin() || (
          // Temporary relaxation for debugging
          incoming().role == existing().role &&
          incoming().status == existing().status
        )
      );
      allow delete: if isAdmin();
    }`;
const replacement = `    match /users/{userId} {
      allow get: if isOwnerOrAdmin(userId);
      allow list: if isAdmin();
      allow create: if isOwnerOrAdmin(userId);
      allow update: if isOwnerOrAdmin(userId);
      allow delete: if isAdmin();
    }`;
if (rules.includes(target)) {
  fs.writeFileSync('firestore.rules', rules.replace(target, replacement));
  console.log('Replaced');
} else {
  console.log('Not found');
}
