import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import admin from "firebase-admin";
import { Resend } from "resend";
import dotenv from "dotenv";
import fs from "fs";

// Load environment variables
dotenv.config();

const __dirname = path.resolve();

// Read Firebase configurations
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
let firebaseConfig: any = {};
if (fs.existsSync(firebaseConfigPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
  } catch (err) {
    console.error("Error reading firebase-applet-config.json:", err);
  }
}

// Initialize Firebase Admin
let firestoreDb: admin.firestore.Firestore | null = null;
try {
  const adminConfig: any = {};
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    adminConfig.credential = admin.credential.cert(serviceAccount);
  } else {
    adminConfig.projectId = firebaseConfig.projectId || "gen-lang-client-0052201582";
  }

  admin.initializeApp(adminConfig);

  // Initialize Firestore with explicit databaseId to avoid looking for the "(default)" DB
  const dbSettings: any = {
    projectId: firebaseConfig.projectId || "gen-lang-client-0052201582",
    databaseId: firebaseConfig.firestoreDatabaseId || "(default)"
  };

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    dbSettings.credentials = serviceAccount;
  }

  firestoreDb = new admin.firestore.Firestore(dbSettings);
  console.log("Firebase Admin Firestore successfully initialized with database:", dbSettings.databaseId);
} catch (error) {
  console.error("Warning: Firebase Admin initialization failed:", error);
}

// Initialize Resend
const getResendClient = (): Resend | null => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("Warning: RESEND_API_KEY is not configured.");
    return null;
  }
  return new Resend(apiKey);
};

// Elegant HTML dynamic template for check report notification emails
function generateReportHtml(userName: string, checks: any[]): string {
  const tableRows = checks.map(check => `
    <tr>
      <td style="padding: 16px 12px; border-bottom: 1px solid #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; color: #1e293b; font-weight: 500;">
        ${check.checkNumber || 'N/A'}
      </td>
      <td style="padding: 16px 12px; border-bottom: 1px solid #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; color: #334155;">
        ${check.beneficiaryName || 'N/A'}
      </td>
      <td style="padding: 16px 12px; border-bottom: 1px solid #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; color: #0f172a; font-weight: 700; text-align: right;">
        $${Number(check.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td style="padding: 16px 12px; border-bottom: 1px solid #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; color: #ef4444; font-weight: 600; text-align: center;">
        ${check.dueDate || 'N/A'}
      </td>
    </tr>
  `).join('');

  const totalAmount = checks.reduce((sum, check) => sum + Number(check.amount || 0), 0);

  return `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Control de Cheques por Pagar</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-text-size-adjust: none; text-size-adjust: none;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 16px;">
          <tr>
            <td align="center">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 24px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.03), 0 4px 6px -4px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0; overflow: hidden;">
                <!-- Header Card -->
                <tr>
                  <td style="padding: 40px; background-color: #4f46e5; text-align: center;">
                    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif; font-size: 11px; font-weight: 800; color: #c7d2fe; text-transform: uppercase; letter-spacing: 0.15em; display: inline-block; margin-bottom: 6px;">Reporte Automatizado</span>
                    <h1 style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif; font-size: 26px; font-weight: 900; color: #ffffff; text-transform: uppercase; letter-spacing: -0.02em; font-style: italic;">
                      Terminal de Pagos
                    </h1>
                  </td>
                </tr>
                
                <!-- Body Area -->
                <tr>
                  <td style="padding: 40px;">
                    <p style="margin: 0 0 12px 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 16px; color: #0f172a; font-weight: 600;">
                      Estimado/a ${userName},
                    </p>
                    <p style="margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; color: #64748b; line-height: 1.6;">
                      A continuación, adjuntamos el estado de cuenta y cartera detallada de sus cheques en estado <strong>PENDIENTE</strong> por cobrar. Por favor concilie sus saldos oportunamente.
                    </p>
                    
                    <!-- Table component -->
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-bottom: 24px;">
                      <thead>
                        <tr style="background-color: #f8fafc;">
                          <th style="padding: 12px 8px; text-align: left; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0;">Nº Cheque</th>
                          <th style="padding: 12px 8px; text-align: left; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0;">Beneficiario</th>
                          <th style="padding: 12px 8px; text-align: right; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0;">Monto (USD)</th>
                          <th style="padding: 12px 8px; text-align: center; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0;">Vencimiento</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${tableRows}
                        <tr style="background-color: #f8fafc;">
                          <td colspan="2" style="padding: 18px 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px; font-weight: bold; color: #1e293b; border-top: 2px solid #e2e8f0;">
                            TOTAL CHEQUES DE CARTERA
                          </td>
                          <td style="padding: 18px 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 16px; font-weight: 800; color: #4f46e5; text-align: right; border-top: 2px solid #e2e8f0;">
                            $${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style="border-top: 2px solid #e2e8f0;"></td>
                        </tr>
                      </tbody>
                    </table>
                    
                    <div style="padding: 16px; background-color: #f5f3ff; border-radius: 12px; border: 1px solid #ddd6fe; margin-bottom: 12px;">
                      <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 12px; color: #6d28d9; line-height: 1.5; font-weight: bold; text-align: center;">
                        Este correo es emitido por el sistema como medida preventiva para salvaguardar el orden de sus flujos financieros.
                      </p>
                    </div>
                  </td>
                </tr>
                
                <!-- Footer area -->
                <tr>
                  <td style="padding: 24px 40px; background-color: #f8fafc; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 11px; color: #94a3b8; line-height: 1.5;">
                      Este es una notificación automática del sistema de cobro de cheques. Por favor no responda directamente a este email.
                    </p>
                    <p style="margin: 4px 0 0 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 11px; color: #94a3b8; line-height: 1.5;">
                      © 2026 Aplicación Registradora y Terminal de Cheques. Todos los derechos reservados.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse incoming JSON bodies
  app.use(express.json());

  app.get("/api/diagnostics/db", async (req, res) => {
    try {
      if (!firestoreDb) {
        return res.status(500).json({ error: "Firestore is not initialized" });
      }
      const empSnap = await firestoreDb.collection("employees").get();
      const employees = empSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const budgetSnap = await firestoreDb.collection("budgets").get();
      const budgets = budgetSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const collSnap = await firestoreDb.collection("collections").get();
      const collections = collSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const salesSnap = await firestoreDb.collection("sales").get();
      const sales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      res.json({ employees, budgets, collections, sales });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 1. Endpoint api/users/profile - user persistence (upsert)
  app.post("/api/users/profile", async (req, res) => {
    try {
      const { uid, email, displayName } = req.body;
      if (!uid || !email) {
        return res.status(400).json({ error: "Missing required profile parameters ('uid' and 'email' are required)." });
      }

      if (!firestoreDb) {
        return res.status(503).json({ error: "Backend database initialization check failed." });
      }

      const userRef = firestoreDb.collection("users").doc(uid);
      const docSnap = await userRef.get();

      const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') as string;
      const nowIso = new Date().toISOString();

      if (!docSnap.exists) {
        // Create new user with ENABLED state and 90 days courtesy subscription
        const ninetyDaysExpiry = new Date();
        ninetyDaysExpiry.setDate(ninetyDaysExpiry.getDate() + 90);

        const SUPER_ADMIN_EMAILS = [
          process.env.VITE_SUPER_ADMIN_EMAIL,
          ...(process.env.VITE_SUPER_ADMIN_EMAILS || '').split(',').map((e: string) => e.trim())
        ].filter(Boolean) as string[];

        const isAdminEmail = SUPER_ADMIN_EMAILS.includes(email);

        const newUserProfile = {
          name: displayName || email.split('@')[0],
          ruc: "",
          phone: "",
          email: email,
          role: isAdminEmail ? "SUPERADMIN" : "USER",
          status: "ENABLED",
          hasCompletedOnboarding: isAdminEmail,
          subscriptionEnd: ninetyDaysExpiry.toISOString(),
          pin: "",
          pinInactivityLimit: 60,
          lastPinEntry: nowIso,
          createdAt: nowIso,
          lastLoginAt: nowIso,
          lastIp: clientIp
        };

        await userRef.set(newUserProfile);

        // Sync custom user claims via Firebase Admin SDK
        if (isAdminEmail) {
          try {
            await admin.auth().setCustomUserClaims(uid, {
              admin: true,
              role: 'SUPERADMIN'
            });
            console.log(`Custom claims successfully set for SUPERADMIN: ${email}`);
          } catch (claimsError) {
            console.warn("Failed to set custom user claims on registration:", claimsError);
          }
        }

        return res.status(201).json({ status: "created", profile: newUserProfile });
      } else {
        const SUPER_ADMIN_EMAILS = [
          process.env.VITE_SUPER_ADMIN_EMAIL,
          ...(process.env.VITE_SUPER_ADMIN_EMAILS || '').split(',').map((e: string) => e.trim())
        ].filter(Boolean) as string[];

        const isAdminEmail = SUPER_ADMIN_EMAILS.includes(email);

        // Update only dynamic fields (avoid resetting custom fields like PIN)
        const updateFields: any = {
          lastLoginAt: nowIso,
          lastIp: clientIp
        };

        const existingData = docSnap.data() || {};
        let currentRole = existingData.role || 'USER';

        if (isAdminEmail && currentRole !== 'SUPERADMIN') {
          updateFields.role = 'SUPERADMIN';
          updateFields.hasCompletedOnboarding = true;
          currentRole = 'SUPERADMIN';
        }

        await userRef.update(updateFields);

        // Sync custom user claims dynamically via Firebase Admin SDK for ANY user based on their stored role!
        try {
          const isUserAdmin = currentRole === 'SUPERADMIN' || currentRole === 'ADMIN';
          await admin.auth().setCustomUserClaims(uid, {
            admin: isUserAdmin,
            role: currentRole
          });
          console.log(`Custom claims dynamically updated for ${email}: admin=${isUserAdmin}, role=${currentRole}`);
        } catch (claimsError) {
          console.warn("Failed to sync custom user claims on update:", claimsError);
        }

        return res.status(200).json({ status: "updated", updatedFields: updateFields });
      }
    } catch (err: any) {
      const isPermissionDenied = err.message && (
        err.message.includes("PERMISSION_DENIED") || 
        err.message.includes("insufficient permissions") || 
        err.message.includes("Missing or insufficient permissions")
      );
      
      if (isPermissionDenied && !process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        console.warn("----------------------------------------------------------------------");
        console.warn("AVISO DE CONFIGURACIÓN DE FIREBASE (SERVER-SIDE):");
        console.warn("El servidor backend Express no pudo sincronizar el perfil debido a falta de permisos.");
        console.warn("Esto sucede porque en el entorno de vista previa (AI Studio), el contenedor ejecuta en un");
        console.warn("proyecto GCP diferente que carece de permisos de IAM para tu base de datos de Firebase.");
        console.warn("");
        console.warn("SOLUCIÓN:");
        console.warn("Para que la sincronización completa del servidor backend funcione, debes proveer tu JSON:");
        console.warn("1. Ve al panel de control de Firebase -> Configuración del proyecto -> Cuentas de servicio.");
        console.warn("2. Haz clic en 'Generar nueva clave privada' para descargar el archivo JSON.");
        console.warn("3. En AI Studio, agrega la variable de entorno 'FIREBASE_SERVICE_ACCOUNT_KEY' con el contenido de ese JSON.");
        console.warn("----------------------------------------------------------------------");
        
        return res.status(202).json({
          status: "pending_configuration",
          message: "Full-stack user profile synchronization is pending service account configuration.",
          warning: "FIREBASE_SERVICE_ACCOUNT_KEY context is missing. Client-side Firestore operations remain fully functional."
        });
      }

      console.error("Error inside profile synchronization:", err);
      return res.status(500).json({ error: "Internal server error during user profile synchronization.", details: err.message });
    }
  });

  // Endpoint to sync claims for any user (called by admin or automatically)
  app.post("/api/admin/sync-claims", async (req, res) => {
    try {
      const { uid } = req.body;
      if (!uid) {
        return res.status(400).json({ error: "Missing required uid parameter." });
      }

      if (!firestoreDb) {
        return res.status(503).json({ error: "Database not connected." });
      }

      const userDoc = await firestoreDb.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found." });
      }

      const userData = userDoc.data() || {};
      const role = userData.role || 'USER';
      const isUserAdmin = role === 'SUPERADMIN' || role === 'ADMIN';

      await admin.auth().setCustomUserClaims(uid, {
        admin: isUserAdmin,
        role: role
      });

      console.log(`Successfully synced claims for ${uid}: admin=${isUserAdmin}, role=${role}`);
      res.json({ success: true, role, admin: isUserAdmin });
    } catch (error: any) {
      console.error("Error syncing claims:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Route Cron for Daily Reports - /api/cron/daily-report
  app.all("/api/cron/daily-report", async (req, res) => {
    try {
      const cronSecret = process.env.CRON_SECRET;
      const authorizationHeader = req.headers.authorization;
      const querySecret = req.query.cron_secret || req.query.secret;

      // Restrict access using the CRON_SECRET if it's set (allow a manual UI bypass header or query)
      const isBypassed = req.query.bypass === "true" || req.headers["x-bypass-cron"] === "true";
      if (cronSecret && !isBypassed) {
        const isAuthHeaderMatch = authorizationHeader === `Bearer ${cronSecret}`;
        const isQuerySecretMatch = querySecret === cronSecret;
        const isCustomHeaderMatch = req.headers['x-cron-secret'] === cronSecret;

        if (!isAuthHeaderMatch && !isQuerySecretMatch && !isCustomHeaderMatch) {
          return res.status(401).json({ error: "Unauthorized: Invalid CRON_SECRET." });
        }
      } else if (isBypassed) {
        console.log("Cron execution bypassed security checks via explicit user bypass parameter.");
      } else {
        console.warn("Warning: CRON_SECRET is not set in environment. Bypassing cron security verification.");
      }

      if (!firestoreDb) {
        return res.status(503).json({ error: "Database not connected. Please verify settings." });
      }

      // Fetch active users with status "ENABLED"
      const usersSnapshot = await firestoreDb.collection("users")
        .where("status", "==", "ENABLED")
        .get();

      if (usersSnapshot.empty) {
        return res.status(200).json({ message: "No active users found." });
      }

      const now = new Date();
      const activeUsers: any[] = [];

      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.subscriptionEnd) {
          const expDate = new Date(data.subscriptionEnd);
          if (expDate >= now) {
            activeUsers.push({ id: doc.id, ...data });
          }
        }
      });

      if (activeUsers.length === 0) {
        return res.status(200).json({ message: "No users with active, unexpired subscriptions." });
      }

      // Query checks with status "PENDING" for each user
      const reportList: any[] = [];
      for (const currentUser of activeUsers) {
        const checksSnapshot = await firestoreDb.collection("checks")
          .where("userId", "==", currentUser.id)
          .where("status", "==", "PENDING")
          .get();

        if (!checksSnapshot.empty) {
          const userPendingChecks: any[] = [];
          checksSnapshot.forEach((chkDoc) => {
            userPendingChecks.push({ id: chkDoc.id, ...chkDoc.data() });
          });

          reportList.push({
            user: currentUser,
            checks: userPendingChecks
          });
        }
      }

      if (reportList.length === 0) {
        return res.status(200).json({ message: "No active users have pending checks." });
      }

      // Initialize Resend
      const resend = getResendClient();
      if (!resend) {
        return res.status(200).json({
          message: "Report cron executed in dry-run mode successfully.",
          warnings: ["RESEND_API_KEY environment variable is missing. Skip mailing."],
          stats: {
            activeUsersChecked: activeUsers.length,
            usersNeedsMailing: reportList.length,
            targets: reportList.map(item => ({ email: item.user.email, name: item.user.name, count: item.checks.length }))
          }
        });
      }

      // Mailing in Safe Batches of 10 to avoid Timeout limits
      const results: any[] = [];
      const batchSize = 10;

      for (let i = 0; i < reportList.length; i += batchSize) {
        const currentBatch = reportList.slice(i, i + batchSize);

        const emailPromises = currentBatch.map(async (item) => {
          const userEmail = item.user.email;
          if (!userEmail) return { success: false, error: "No email address found for the profile." };

          try {
            const htmlEmail = generateReportHtml(item.user.name || "Usuario", item.checks);
            const sendResponse = await resend.emails.send({
              from: process.env.RESEND_FROM_EMAIL || "Notificaciones <onboarding@resend.dev>",
              to: userEmail,
              subject: `⚠️ Reporte Diario de Cheques Pendientes - Terminal de Pagos`,
              html: htmlEmail
            });
            
            console.log(`[Resend Output for ${userEmail}]`, JSON.stringify(sendResponse));
            
            if (sendResponse.error) {
              return { 
                email: userEmail, 
                success: false, 
                error: sendResponse.error.message || `Resend error: ${JSON.stringify(sendResponse.error)}`
              };
            }
            
            return { email: userEmail, success: true, id: sendResponse.data?.id };
          } catch (mErr: any) {
            return { email: userEmail, success: false, error: mErr.message || String(mErr) };
          }
        });

        const settledPromises = await Promise.allSettled(emailPromises);
        results.push(...settledPromises);
      }

      const allDeliveriesSuccessful = results.every((r: any) => r.status === 'fulfilled' && r.value && r.value.success);

      return res.status(200).json({
        success: allDeliveriesSuccessful,
        stats: {
          activeUsersCount: activeUsers.length,
          notifiedUsersCount: reportList.length,
          resultsDetail: results.map((r: any) => r.value || r)
        },
        deliveryResults: results
      });
    } catch (err: any) {
      const isPermissionDenied = err.message && (
        err.message.includes("PERMISSION_DENIED") || 
        err.message.includes("insufficient permissions") || 
        err.message.includes("Missing or insufficient permissions")
      );
      
      if (isPermissionDenied && !process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        console.warn("----------------------------------------------------------------------");
        console.warn("AVISO DE CONFIGURACIÓN DE CRON DIARIO (PERMISSION_DENIED):");
        console.warn("El Cron no tiene clave de servicio para consultar la base de datos Firestore.");
        console.warn("Configure 'FIREBASE_SERVICE_ACCOUNT_KEY' con su JSON de cuenta de servicio.");
        console.warn("----------------------------------------------------------------------");
        
        return res.status(202).json({
          success: false,
          error: "Permission Denied: Service Account Key required.",
          help: "Please configure 'FIREBASE_SERVICE_ACCOUNT_KEY' environment variable with your Firebase Admin Service Account JSON to let cron jobs access database records."
        });
      }

      console.error("Fatal error running daily report cron:", err);
      return res.status(500).json({ error: "Internal server error of cron job execution", details: err.message });
    }
  });

  // 3. Simple Direct Test Email Endpoint - /api/emails/test-direct
  app.post("/api/emails/test-direct", express.json(), async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Falta la dirección de correo 'email' para enviar la prueba." });
      }

      // Initialize Resend
      const resend = getResendClient();
      if (!resend) {
        return res.status(200).json({
          success: false,
          error: "La variable de entorno RESEND_API_KEY no está configurada.",
          help: "Por favor define RESEND_API_KEY en las variables de entorno de AI Studio para enviar correos reales."
        });
      }

      const htmlEmail = `
        <div style="font-family: sans-serif; padding: 32px; background-color: #f8fafc; border-radius: 20px; border: 1px solid #e2e8f0; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #059669; margin-bottom: 12px; font-size: 22px;">🔔 Conexión de Resend Exitosa</h2>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">¡Felicidades! La integración directa de Resend con tu Terminal de Cheques está completamente operativa.</p>
          <p style="color: #475569; font-size: 14px; background-color: #f1f5f9; padding: 12px; border-radius: 8px; margin-top: 16px; font-family: monospace;">
            Enviado a: ${email}
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center;">Este correo es una prueba de envío directo desde el servidor backend.</p>
        </div>
      `;

      console.log(`[Resend Direct Test Initiating for recipient: ${email}]`);
      const sendResponse = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "Notificaciones <onboarding@resend.dev>",
        to: email,
        subject: "🔔 Prueba Directa de Conexión - Resend",
        html: htmlEmail
      });

      console.log(`[Resend Direct Test Response]`, JSON.stringify(sendResponse));

      if (sendResponse.error) {
        return res.status(400).json({
          success: false,
          error: sendResponse.error.message || "Error retornado por la API de Resend",
          details: JSON.stringify(sendResponse.error, null, 2)
        });
      }

      return res.status(200).json({
        success: true,
        message: "¡Correo de prueba enviado exitosamente a través de Resend!",
        data: sendResponse.data
      });
    } catch (err: any) {
      console.error("Fatal error during direct test email:", err);
      return res.status(500).json({ error: "Error de servidor al enviar correo de prueba.", details: err.message });
    }
  });

  // Service Routing
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
