import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, User as FirebaseUser, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { addDays, isAfter, parseISO } from 'date-fns';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { logAudit, AuditAction } from '../lib/audit';
import { hashPin } from '../lib/utils';
import { isSuperAdminEmail } from '../lib/utils';

export interface UserProfile {
  uid?: string;
  name: string;
  ruc?: string;
  phone?: string;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'USER' | 'BODEGUERO' | 'enterprise' | 'employee';
  status: 'ENABLED' | 'DISABLED';
  subscriptionEnd: string;
  pin: string;
  pinInactivityLimit: number;
  lastPinEntry: string;
  createdAt: string;
  enterpriseId?: string;
  photoUrl?: string;
  hasCompletedOnboarding?: boolean;
  totpSecret?: string;
  totpEnabled?: boolean;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  sessionVerified: boolean;
  isAdmin: boolean;
  isExpired: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  setSessionVerified: (val: boolean) => void;
  // User simulation properties (untracked in visible updates history indexes)
  impersonatedUser: { uid: string; email: string; displayName?: string } | null;
  impersonatedBy: FirebaseUser | null;
  impersonateUser: (targetUser: { uid: string; email: string; displayName?: string } | null) => Promise<void>;
  originalUser: FirebaseUser | null;
  originalProfile: UserProfile | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [actualUser, setActualUser] = useState<FirebaseUser | null>(null);
  const [actualProfile, setActualProfile] = useState<UserProfile | null>(null);
  const [impersonatedUser, setImpersonatedUser] = useState<{ uid: string; email: string; displayName?: string } | null>(null);
  const [impersonatedBy, setImpersonatedBy] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionVerified, setSessionVerified] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setActualUser(firebaseUser);
      if (firebaseUser) {
        try {
          // Sync login or profile with full-stack backend
          try {
            await fetch('/api/users/profile', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName || '',
                photoURL: firebaseUser.photoURL || ''
              })
            });
          } catch (backendError) {
            console.warn('Full-stack profile synchronization pending: ', backendError);
          }

          const docRef = doc(db, 'users', firebaseUser.uid);
          let docSnap;
          try {
            docSnap = await getDoc(docRef);
          } catch (error) {
            handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
            setLoading(false);
            return;
          }
          
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            setActualProfile(data);
            setProfile(data);
            
            // Auto-verify if today is the same as lastPinEntry and within timeout
            if (data.lastPinEntry) {
              let lastEntry: Date;
              if (typeof data.lastPinEntry === 'string') {
                lastEntry = parseISO(data.lastPinEntry);
              } else if ((data.lastPinEntry as any)?.toDate) {
                lastEntry = (data.lastPinEntry as any).toDate();
              } else {
                lastEntry = new Date(data.lastPinEntry);
              }
              const now = new Date();
              const diffMins = (now.getTime() - lastEntry.getTime()) / 60000;
              
              if (now.toDateString() === lastEntry.toDateString() && diffMins < (data.pinInactivityLimit || 1440)) {
                setSessionVerified(true);
              }
            }
          } else {
            console.log("Profile not found locally, creating client-side fallback...");
            const defaultProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || 'Usuario Nuevo',
              role: (isSuperAdminEmail(firebaseUser.email) ? 'SUPERADMIN' : 'USER') as any,
              status: 'ENABLED' as any,
              hasCompletedOnboarding: isSuperAdminEmail(firebaseUser.email),
              subscriptionEnd: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
              createdAt: serverTimestamp(),
              pin: "",
              pinInactivityLimit: 60,
              lastPinEntry: serverTimestamp()
            };
            try {
              await setDoc(docRef, defaultProfile);
              setActualProfile(defaultProfile as unknown as UserProfile);
              setProfile(defaultProfile as unknown as UserProfile);
            } catch (err) {
              console.error("Could not create fallback profile", err);
              setActualProfile(null);
              setProfile(null);
            }
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
        } finally {
          setLoading(false);
        }
      } else {
        setActualProfile(null);
        setProfile(null);
        setSessionVerified(false);
        setImpersonatedUser(null);
        setImpersonatedBy(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

useEffect(() => {
    getRedirectResult(auth).then(result => {
      if (result) {
        logAudit(AuditAction.USER_LOGIN, 'Inicio de sesión exitoso por redirección Google', undefined, result.user);
      }
    }).catch(error => {
      console.error("Error from redirect result:", error);
    });
  }, []);

  useEffect(() => {
    if (!sessionVerified || !profile?.pinInactivityLimit) return;
    
    let inactivityTimeout: NodeJS.Timeout;
    
    const resetTimer = () => {
      clearTimeout(inactivityTimeout);
      inactivityTimeout = setTimeout(() => {
        setSessionVerified(false);
      }, profile.pinInactivityLimit * 60000);
    };

    resetTimer();

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    events.forEach(event => {
      document.addEventListener(event, resetTimer, { passive: true });
    });

    return () => {
      clearTimeout(inactivityTimeout);
      events.forEach(event => {
        document.removeEventListener(event, resetTimer);
      });
    };
  }, [sessionVerified, profile?.pinInactivityLimit]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    try {
      const result = await signInWithPopup(auth, provider);
      if (!auth.currentUser) {
        if (window.self !== window.top) {
          throw new Error("Su navegador bloquea el acceso en esta vista incrustada. Por favor, abra la aplicación en una pestaña nueva para iniciar sesión.");
        }
        throw new Error("Edge/Safari está bloqueando las cookies de terceros. Para iniciar sesión, desactive la prevención de rastreo (ícono de candado/escudo en la URL) o permita cookies de terceros.");
      }
      
      // checkUserExists logic
      const firebaseUser = result.user;
      const docRef = doc(db, 'users', firebaseUser.uid);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        console.log("checkUserExists: Profile not found, creating initial document during login flow...");
        const defaultProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || 'Usuario Nuevo',
          role: (isSuperAdminEmail(firebaseUser.email) ? 'SUPERADMIN' : 'USER') as any,
          status: 'ENABLED' as any,
          hasCompletedOnboarding: isSuperAdminEmail(firebaseUser.email),
          subscriptionEnd: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: serverTimestamp(),
          pin: "",
          pinInactivityLimit: 60,
          lastPinEntry: serverTimestamp()
        };
        try {
          await setDoc(docRef, defaultProfile);
          setActualProfile(defaultProfile as unknown as UserProfile);
          setProfile(defaultProfile as unknown as UserProfile);
        } catch (err) {
          console.error("checkUserExists: Could not create fallback profile during login", err);
          throw new Error("No se pudo crear el perfil de usuario. Intenta de nuevo.");
        }
      }
      
      logAudit(AuditAction.USER_LOGIN, 'Inicio de sesión exitoso por proveedor Google', undefined, result.user);
    } catch (error: any) {
      console.error("Error signing in with Google popup", error);
      if (error.code === 'auth/unauthorized-domain') {
        throw new Error('El dominio actual no está autorizado. Ve a Firebase Console -> Authentication -> Settings -> Authorized domains y añade tu dominio de Vercel.');
      }
      
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
        throw new Error('La ventana de Google fue cerrada o bloqueada. Permite las ventanas emergentes e intenta nuevamente.');
      }

      if (error.message.includes('cross-origin') || error.message.includes('third-party') || error.code === 'auth/internal-error') {
        throw new Error("Tu navegador bloquea las cookies de Firebase. Desactiva la Prevención de Rastreo (Edge/Brave) o permite cookies de terceros e intenta de nuevo.");
      }
      
      throw new Error(error.message || 'Ocurrió un error al iniciar sesión. Intenta en otro navegador.');
    }
  };

  const logout = async () => {
    try {
      logAudit(AuditAction.USER_LOGOUT, 'Cierre de sesión manual');
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const verifyPin = async (pin: string) => {
    const targetUid = actualUser?.uid;
    const targetProfile = actualProfile;
    if (!targetUid || !targetProfile) return false;
    
    // For backwards compatibility during migration, check plain text or hash
    const hashedPin = await hashPin(pin);
    const isMatch = targetProfile.pin === hashedPin || targetProfile.pin === pin;
    
    if (isMatch) {
      try {
        await updateDoc(doc(db, 'users', targetUid), {
          lastPinEntry: serverTimestamp()
        });
        const updatedTime = new Date().toISOString();
        if (actualProfile) setActualProfile({ ...actualProfile, lastPinEntry: updatedTime });
        if (!impersonatedUser && profile) setProfile({ ...profile, lastPinEntry: updatedTime });
        setSessionVerified(true);
        return true;
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
      }
    }
    return false;
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    const activeUid = impersonatedUser ? impersonatedUser.uid : actualUser?.uid;
    if (!activeUid) return;
    
    // Hash PIN if it is being updated
    const dataToSave = { ...data };
    if (dataToSave.pin) {
      dataToSave.pin = await hashPin(dataToSave.pin);
    }
    
    const docRef = doc(db, 'users', activeUid);
    try {
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        const activeEmail = impersonatedUser ? impersonatedUser.email : (actualUser?.email || '');
        const isAdminEmail = isSuperAdminEmail(activeEmail);
        const newProfile = {
          name: dataToSave.name || activeEmail.split('@')[0] || 'Usuario Nuevo',
          ruc: dataToSave.ruc || '',
          phone: dataToSave.phone || '',
          email: activeEmail,
          role: isAdminEmail ? 'SUPERADMIN' : 'USER',
          hasCompletedOnboarding: isAdminEmail ? true : undefined,
          status: 'ENABLED',
          subscriptionEnd: addDays(new Date(), 90).toISOString(),
          pin: dataToSave.pin || '',
          pinInactivityLimit: 60,
          lastPinEntry: serverTimestamp(),
          createdAt: serverTimestamp(),
          enterpriseId: activeUid,
          ...dataToSave
        };
        console.log("newProfile", newProfile); console.log("Creating new profile:", JSON.stringify(newProfile, null, 2)); await setDoc(docRef, newProfile);
        setProfile(newProfile as unknown as UserProfile);
        if (!impersonatedUser) {
          setActualProfile(newProfile as unknown as UserProfile);
        }
      } else {
        await updateDoc(docRef, dataToSave);
        if (profile) setProfile({ ...profile, ...dataToSave });
        if (!impersonatedUser && actualProfile) setActualProfile({ ...actualProfile, ...dataToSave });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${activeUid}`);
    }
  };

  const impersonateUser = async (targetUser: { uid: string; email: string; displayName?: string } | null) => {
    if (!actualUser) return;
    if (!isSuperAdminEmail(actualUser.email)) {
      throw new Error('Solo el Super-Administrador absoluto puede iniciar una simulación de sesión.');
    }

    if (targetUser === null) {
      setImpersonatedUser(null);
      setImpersonatedBy(null);
      setProfile(actualProfile);
      setSessionVerified(true); // Super-Admin returns to verified status
      logAudit(AuditAction.SETTINGS_UPDATE, 'Finalizó simulación de identidad del cliente.');
    } else {
      setImpersonatedUser(targetUser);
      setImpersonatedBy(actualUser);
      
      // Load target user profile
      try {
        const docRef = doc(db, 'users', targetUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          // Fallback static profile structured gracefully
          setProfile({
            name: targetUser.displayName || targetUser.email.split('@')[0],
            email: targetUser.email,
            role: 'USER',
            status: 'ENABLED',
            subscriptionEnd: addDays(new Date(), 90).toISOString(),
            pin: '',
            pinInactivityLimit: 60,
            lastPinEntry: new Date().toISOString(),
            createdAt: new Date().toISOString()
          });
        }
        setSessionVerified(true); // Automatically bypass security keys & PINs during active simulation
        logAudit(AuditAction.SETTINGS_UPDATE, `Inició simulación de identidad para la cuenta: ${targetUser.email}`);
      } catch (error) {
        console.error("Error loading simulation profile from Firestore:", error);
      }
    }
  };

  const effectiveUser = impersonatedUser && actualUser ? ({
    ...actualUser,
    uid: impersonatedUser.uid,
    email: impersonatedUser.email,
    displayName: impersonatedUser.displayName || '',
  } as unknown as FirebaseUser) : actualUser;

  const isSuperAdminOriginal = isSuperAdminEmail(actualUser?.email);
  const isAdmin = profile?.role === 'ADMIN' || profile?.role === 'SUPERADMIN' || isSuperAdminEmail(effectiveUser?.email);
  const isExpired = profile 
    ? (!isAdmin && !isSuperAdminOriginal && (isAfter(new Date(), parseISO(profile.subscriptionEnd)) || profile.status === 'DISABLED')) 
    : (!!effectiveUser);

  return (
    <AuthContext.Provider value={{ 
      user: effectiveUser,
      profile,
      loading,
      sessionVerified,
      isAdmin,
      isExpired,
      login,
      logout,
      verifyPin,
      updateProfile,
      setSessionVerified,
      impersonatedUser,
      impersonatedBy,
      impersonateUser,
      originalUser: actualUser,
      originalProfile: actualProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
