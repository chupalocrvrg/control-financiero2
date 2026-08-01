import React, { useState } from 'react';
import { useNotification } from "../contexts/NotificationContext";
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Building2, ShieldCheck, UserPlus, Fingerprint, X, ScrollText, ArrowLeft } from 'lucide-react';

export default function Onboarding() {
  const { updateProfile, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    ruc: '',
    phone: '',
    pin: '',
  });

  const handleBack = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error("Error logging out", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateProfile({ ...formData, hasCompletedOnboarding: true });
      navigate('/');
    } catch (error) {
      console.error("Error updating profile:", error);
      showToast("Error al configurar tu cuenta. Intenta de nuevo.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors duration-500 relative">
      <button
        onClick={handleBack}
        className="absolute top-4 left-4 sm:top-8 sm:left-8 p-3 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-full transition-all"
        title="Volver"
      >
        <ArrowLeft className="w-6 h-6" />
      </button>
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-8">
          <div className="p-4 bg-indigo-600 text-white rounded-3xl shadow-xl shadow-indigo-100 dark:shadow-none animate-in zoom-in-50 duration-700">
            <UserPlus className="h-8 w-8" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-black text-neutral-900 dark:text-neutral-50 tracking-tighter uppercase italic">
          Configuración Maestro
        </h2>
        <p className="mt-2 text-center text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">
          Establece los parámetros base de tu cuenta corporativa
        </p>
      </div>

      <div className="mt-12 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-neutral-900 py-10 px-8 shadow-xl shadow-neutral-200/50 dark:shadow-none sm:rounded-[3rem] border border-neutral-100 dark:border-neutral-800 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <form className="space-y-8" onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="name" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">
                  Nombre o Razón Social
                </label>
                <div className="relative">
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl px-5 py-4 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-neutral-300"
                    placeholder="Ej: Inversiones Global S.A."
                  />
                  <Building2 className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-300" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="ruc" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">
                    ID / RUC
                  </label>
                  <input
                    id="ruc"
                    name="ruc"
                    type="text"
                    value={formData.ruc}
                    onChange={(e) => setFormData({ ...formData, ruc: e.target.value })}
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl px-5 py-4 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-neutral-300"
                    placeholder="Opcional"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="phone" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">
                    Contacto
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl px-5 py-4 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-neutral-300"
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label htmlFor="pin" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">
                  PIN Transaccional (6 dígitos)
                </label>
                <div className="relative">
                  <input
                    id="pin"
                    name="pin"
                    type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" inputMode="numeric" pattern="[0-9]*"
                    required
                    maxLength={6}
                    
                    value={formData.pin}
                    onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl px-5 py-5 text-white text-center text-2xl tracking-[0.6em] font-black focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all placeholder:text-neutral-700"
                    placeholder="000000"
                  />
                  <Fingerprint className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-700" />
                </div>
                <p className="text-[9px] text-neutral-400 font-medium text-center mt-2">Este código será requerido para cada sesión de trabajo.</p>
              </div>
              
              <div className="flex items-start gap-3 mt-4 bg-indigo-50/50 dark:bg-indigo-900/10 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
                <input 
                  type="checkbox" 
                  id="terms" 
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 w-4 h-4 text-indigo-600 rounded border-neutral-300 focus:ring-indigo-500"
                />
                <label htmlFor="terms" className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  He leído y acepto los <button type="button" onClick={() => setShowTerms(true)} className="text-indigo-600 dark:text-indigo-400 underline font-bold uppercase tracking-wide">Términos y Condiciones</button> de la plataforma.
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || formData.pin.length !== 6 || !termsAccepted}
              className="w-full flex items-center justify-center py-5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[1.5rem] text-sm font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 disabled:opacity-30 transition-all hover:scale-[1.02] active:scale-95"
            >
              {loading ? 'Inicializando...' : 'Activar Terminal de Pagos'}
            </button>
          </form>
        </div>
        <div className="mt-8 flex items-center justify-center gap-2">
          <ShieldCheck className="w-3 h-3 text-emerald-500" />
          <span className="text-[9px] font-black text-neutral-300 dark:text-neutral-700 uppercase tracking-widest">Protocolo de seguridad verificado</span>
        </div>
      </div>

      {showTerms && (
        <div className="fixed inset-0 z-[1000] bg-neutral-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center bg-indigo-50 dark:bg-indigo-900/10">
              <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400 font-bold">
                <ScrollText className="w-5 h-5" />
                <span>Términos y Condiciones</span>
              </div>
              <button onClick={() => setShowTerms(false)} className="text-neutral-400 hover:text-neutral-600 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-sm text-neutral-600 dark:text-neutral-300 text-justify leading-relaxed">
              <h2 className="text-lg font-black text-center mb-4 uppercase tracking-tight">TÉRMINOS Y CONDICIONES DE USO DE LA PLATAFORMA BETA DE CONTROL DE CHEQUES Y GESTIÓN DE GASTOS FINANCIEROS</h2>
              <p className="text-xs text-center text-neutral-400 font-bold">Última actualización: 8 de mayo de 2026</p>
              
              <h3 className="font-bold text-neutral-900 dark:text-neutral-100 mt-6">PREÁMBULO</h3>
              <p>El presente documento constituye un contrato de adhesión de carácter vinculante entre el usuario (en adelante, «EL USUARIO» o «EL TITULAR») y el desarrollador de la plataforma (en adelante, «EL DESARROLLADOR» o «EL PROVEEDOR»), respecto del acceso y uso de la aplicación informática experimental denominada en adelante «LA PLATAFORMA». La Plataforma es un servicio en fase Beta, de carácter gratuito y experimental, destinado exclusivamente al registro referencial de operaciones con cheques y gestión de gastos financieros.</p>
              <p>EL USUARIO declara bajo juramento, en los términos del artículo 1453 del Código Civil ecuatoriano (Codificación No. 2005-003, Registro Oficial Suplemento 46 de 24 de junio de 2005), que ha leído, comprendido y aceptado en su totalidad los presentes Términos y Condiciones (en adelante, «LOS TÉRMINOS»). La mera utilización de LA PLATAFORMA, ya sea mediante acceso web, aplicación móvil o cualquier otro medio de interfaz, implica la aceptación plena, incondicional e irrevocable de LOS TÉRMINOS. Si EL USUARIO no está de acuerdo con cualquiera de las disposiciones aquí contenidas, deberá abstenerse inmediatamente de utilizar LA PLATAFORMA.</p>

              <h3 className="font-bold text-neutral-900 dark:text-neutral-100 mt-6">CAPÍTULO I: NATURALEZA DEL SERVICIO Y ESTATUS BETA (FASE EXPERIMENTAL)</h3>
              <p><strong>Artículo 1. Definición del Servicio y Carácter Experimental.</strong></p>
              <p>1.1. LA PLATAFORMA es una herramienta informática en fase Beta, lo que significa que se encuentra en etapa de pruebas, desarrollo y experimentación técnica. No constituye un producto comercial terminado ni un servicio de producción estable. EL USUARIO reconoce y acepta que el software puede contener errores, defectos, fallos de lógica, interrupciones, vulnerabilidades de seguridad imprevistas y cualquier otra anomalía inherente a un entorno de pruebas.</p>
              <p>1.2. En virtud del principio constitucional de libertad de empresa reconocido en el artículo 66 numeral 15 de la Constitución de la República del Ecuador (en adelante, «LA CONSTITUCIÓN»), así como de la libertad contractual consagrada en el artículo 1453 y siguientes del Código Civil, EL DESARROLLADOR se reserva la facultad irrevocable, unilateral y discrecional de:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>a) Modificar, suspender, interrumpir o cancelar definitivamente el acceso a LA PLATAFORMA, ya sea de forma total o parcial, respecto de uno o varios usuarios, sin necesidad de previo aviso, justificación ni indemnización alguna;</li>
                <li>b) Restringir funcionalidades, limitar el número de transacciones registrables, modificar los algoritmos de cálculo, o alterar cualquier aspecto técnico o funcional de LA PLATAFORMA;</li>
                <li>c) Terminar la prestación del servicio en cualquier momento, por razones técnicas, comerciales, estratégicas o de cualquier otra índole, sin que ello genere responsabilidad contractual ni extracontractual para EL DESARROLLADOR.</li>
              </ul>
              <p>1.3. LA PLATAFORMA se ofrece a título gratuito durante la fase Beta. EL USUARIO no adquiere derecho adquirido alguno sobre la continuidad del servicio ni sobre ninguna de sus funcionalidades. La relación entre EL USUARIO y EL DESARROLLADOR se rige por el principio de precariedad del servicio experimental.</p>

              <p><strong>Artículo 2. Suspensión y Terminación Unilateral.</strong></p>
              <p>2.1. EL DESARROLLADOR podrá suspender o terminar el acceso de EL USUARIO a LA PLATAFORMA de manera inmediata y sin aviso previo en los siguientes casos, enunciados de manera enunciativa mas no limitativa:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>a) Uso indebido, fraudulento o contrario a la legislación ecuatoriana vigente;</li>
                <li>b) Violación de cualquiera de las disposiciones contenidas en LOS TÉRMINOS;</li>
                <li>c) Ingreso de datos manifiestamente falsos, engañosos o que comprometan la integridad del sistema;</li>
                <li>d) Intento de ingeniería inversa, descompilación o extracción no autorizada del código fuente;</li>
                <li>e) Cualquier conducta que EL DESARROLLADOR, a su exclusivo criterio, considere lesiva para los intereses de LA PLATAFORMA o de terceros;</li>
                <li>f) Decisión técnica o comercial del creador, incluyendo la finalización de la fase Beta o la reorientación del proyecto.</li>
              </ul>
              <p>2.2. La terminación del acceso no generará derecho a reclamo, indemnización, restitución ni compensación alguna a favor de EL USUARIO, quien renuncia expresamente a cualquier acción legal al respecto, en los límites permitidos por el ordenamiento jurídico ecuatoriano, particularmente en lo dispuesto en el artículo 1505 del Código Civil sobre la condición resolutoria tácita en los contratos bilaterales.</p>

              <h3 className="font-bold text-neutral-900 dark:text-neutral-100 mt-6">CAPÍTULO II: LIMITACIÓN DE RESPONSABILIDAD FINANCIERA (CLÁUSULA DE EXENCIÓN TOTAL)</h3>
              <p><strong>Artículo 3. Naturaleza de la Herramienta y Ausencia de Asesoría Financiera.</strong></p>
              <p>3.1. LA PLATAFORMA es, única y exclusivamente, una herramienta de registro y cálculo referencial. En ningún caso constituye un servicio de asesoría financiera, contable, tributaria, bursátil, de inversión o de cualquier otra naturaleza profesional regulada. EL USUARIO reconoce que EL DESARROLLADOR no es una institución financiera, no está bajo la supervisión de la Superintendencia de Bancos del Ecuador, y no ofrece servicios que requieran autorización estatal conforme al Código Orgánico Monetario y Financiero.</p>
              <p>3.2. Los reportes, cálculos, proyecciones y cualquier otro resultado generado por LA PLATAFORMA tienen carácter meramente referencial e ilustrativo. EL USUARIO se obliga a verificar de manera independiente toda la información antes de tomar cualquier decisión financiera.</p>

              <p><strong>Artículo 4. Exención Total de Responsabilidad.</strong></p>
              <p>4.1. En aplicación del principio de autonomía de la voluntad consagrado en el artículo 1453 del Código Civil y dentro de los límites establecidos por el artículo 1547 del mismo cuerpo legal sobre la graduación de la culpa, EL USUARIO acepta que EL DESARROLLADOR queda total y absolutamente liberado de cualquier responsabilidad por:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>a) Errores, omisiones, inexactitudes o imprecisiones en los datos ingresados por EL USUARIO;</li>
                <li>b) Fallos de lógica, algoritmos defectuosos o cálculos erróneos derivados de la naturaleza experimental del software;</li>
                <li>c) Pérdidas financieras directas o indirectas, lucro cesante, daño emergente, pérdida de oportunidades de negocio, o cualquier otro perjuicio patrimonial o extrapatrimonial que pudiera derivarse del uso de LA PLATAFORMA;</li>
                <li>d) Interrupciones del servicio, pérdida de datos, fallos de conectividad o cualquier otra incidencia técnica;</li>
                <li>e) Decisiones financieras, comerciales o de cualquier otra índole que EL USUARIO adopte basándose en la información proporcionada por LA PLATAFORMA.</li>
              </ul>
              <p>4.2. La doctrina jurídica ecuatoriana reconoce la validez de las cláusulas restrictivas y exonerativas de responsabilidad en el ámbito contractual, siempre que no vulneren los límites generales y especiales a la autonomía de la voluntad. En este sentido, la presente cláusula se encuentra dentro de los límites permitidos por el ordenamiento jurídico ecuatoriano, excluyendo únicamente la exoneración por dolo o culpa inexcusable del deudor.</p>
              <p>4.3. Si alguna autoridad judicial o administrativa competente declarara la nulidad parcial de esta cláusula, las demás disposiciones de LOS TÉRMINOS mantendrán su plena vigencia.</p>

              <p><strong>Artículo 5. Asunción del Riesgo por el Usuario.</strong></p>
              <p>5.1. EL USUARIO declara conocer y aceptar que el uso de LA PLATAFORMA implica la asunción total y exclusiva de todo riesgo financiero, técnico y legal. EL USUARIO exonera expresamente a EL DESARROLLADOR de cualquier responsabilidad presente o futura relacionada con el uso de LA PLATAFORMA, en la máxima medida permitida por la legislación ecuatoriana.</p>
              <p>5.2. En concordancia con el artículo 322 de LA CONSTITUCIÓN, que reconoce la propiedad intelectual, y con la Ley de Propiedad Intelectual codificada, EL USUARIO acepta que los algoritmos y métodos de cálculo de LA PLATAFORMA son secretos comerciales protegidos y que su imprecisión en fase Beta es un riesgo inherente que EL USUARIO asume voluntariamente.</p>

              <h3 className="font-bold text-neutral-900 dark:text-neutral-100 mt-6">CAPÍTULO III: GARANTÍA DE VERACIDAD Y PRINCIPIO «GARBAGE IN, GARBAGE OUT»</h3>
              <p><strong>Artículo 6. Obligación de Veracidad de los Datos.</strong></p>
              <p>6.1. EL USUARIO se obliga de manera irrevocable a ingresar en LA PLATAFORMA única y exclusivamente información verídica, exacta, completa y verificable. Esta obligación se fundamenta en el principio de buena fe contractual establecido en el artículo 1562 del Código Civil ecuatoriano, según el cual los contratos deben ejecutarse de buena fe y obligan a todas las consecuencias que emanen de su naturaleza.</p>
              <p>6.2. EL USUARIO es el único responsable por la calidad, exactitud y veracidad de los datos ingresados. EL DESARROLLADOR no tiene obligación alguna de verificar, validar, auditar o contrastar la información ingresada por EL USUARIO con fuentes externas.</p>

              <p><strong>Artículo 7. Principio «Garbage In, Garbage Out».</strong></p>
              <p>7.1. LA PLATAFORMA opera bajo el principio técnico conocido como «Garbage In, Garbage Out» (GIGO), según el cual la calidad de los resultados de salida depende directamente de la calidad de los datos de entrada. En consecuencia, EL DESARROLLADOR queda total y absolutamente liberado de cualquier responsabilidad por cálculos, reportes, proyecciones o cualquier otro resultado que se derive de datos erróneos, incompletos, imprecisos, desactualizados o maliciosamente ingresados por EL USUARIO.</p>
              <p>7.2. EL USUARIO renuncia expresamente a cualquier reclamo, acción judicial o extrajudicial, presente o futura, basada en la inexactitud de los resultados generados por LA PLATAFORMA, cuando dicha inexactitud tenga su origen en la deficiente calidad de los datos proporcionados.</p>

              <p><strong>Artículo 8. Exención por Falta de Comprensión de las Funcionalidades.</strong></p>
              <p>8.1. EL USUARIO declara que ha tenido la oportunidad de familiarizarse con las funcionalidades de LA PLATAFORMA y que comprende su carácter experimental. EL DESARROLLADOR no asume responsabilidad alguna por la interpretación errónea, malentendido o falta de comprensión de las funciones de LA PLATAFORMA por parte de EL USUARIO.</p>
              <p>8.2. En virtud del artículo 1547 del Código Civil, que establece que el deudor no es responsable sino de la culpa lata en los contratos que por su naturaleza solo son útiles al acreedor, y considerando que LA PLATAFORMA es un servicio gratuito y experimental que beneficia exclusivamente a EL USUARIO, la responsabilidad de EL DESARROLLADOR se limita a los casos de dolo o culpa grave, quedando excluida cualquier responsabilidad por culpa leve o levísima.</p>

              <h3 className="font-bold text-neutral-900 dark:text-neutral-100 mt-6">CAPÍTULO IV: PROPIEDAD INTELECTUAL Y ACTIVO DIGITAL</h3>
              <p><strong>Artículo 9. Titularidad de los Derechos de Propiedad Intelectual.</strong></p>
              <p>9.1. LA PLATAFORMA, incluyendo pero no limitándose a su código fuente, código objeto, algoritmos, base de datos, diseño de interfaz de usuario, logotipos, marcas, nombres comerciales, documentation técnica, manuales y cualquier otro elemento constitutivo, es propiedad intelectual exclusiva e inalienable de EL DESARROLLADOR.</p>
              <p>9.2. Conforme al artículo 322 de LA CONSTITUCIÓN, que reconoce la propiedad intelectual de acuerdo con las condiciones que señale la ley, y a los artículos 28 y 29 de la Ley de Propiedad Intelectual ecuatoriana, los programas de ordenador (software) se consideran obras literarias y se protegen como tales, independientemente de su forma de expresión, ya sea en código fuente (legible por el hombre) o código objeto (legible por máquina).</p>
              <p>9.3. EL USUARIO no adquiere derecho de propiedad alguno sobre LA PLATAFORMA ni sobre ninguno de sus componentes. La utilización de LA PLATAFORMA se otorga bajo una licencia de uso limitada, revocable, no exclusiva e intransferible, exclusivamente para los fines previstos en LOS TÉRMINOS.</p>

              <p><strong>Artículo 10. Prohibiciones Expresas.</strong></p>
              <p>10.1. Queda terminantemente prohibido a EL USUARIO y a cualquier tercero:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>a) Realizar ingeniería inversa, descompilar, desensamblar o de cualquier otra forma intentar obtener el código fuente de LA PLATAFORMA;</li>
                <li>b) Copiar, reproducir, duplicar, modificar, adaptar, traducir o crear obras derivadas de LA PLATAFORMA, total o parcialmente;</li>
                <li>c) Distribuir, vender, arrendar, licenciar, ceder o transferir LA PLATAFORMA o cualquier copia de la misma a terceros, ya sea a título oneroso o gratuito;</li>
                <li>d) Utilizar LA PLATAFORMA para fines comerciales no autorizados, incluyendo el ofrecimiento de servicios basados en ella;</li>
                <li>e) Eliminar, alterar u ocultar cualquier aviso de derechos de autor, marca registrada u otros derechos de propiedad intelectual.</li>
              </ul>
              <p>10.2. La infracción de cualquiera de estas prohibiciones constituye una violación a los derechos de propiedad intelectual y dará lugar a la terminación inmediata del acceso de EL USUARIO, sin perjuicio de las acciones civiles, penales y administrativas que EL DESARROLLADOR pueda ejercer.</p>

              <p><strong>Artículo 11. Sanciones por Infracción.</strong></p>
              <p>11.1. La infracción a los derechos de propiedad intelectual está tipificada en el artículo 232 del Código Orgánico Integral Penal (COIP), que sanciona el ataque a la integridad de sistemas informáticos con pena privativa de libertad de tres a cinco años, y en el artículo 234 del COIP, que tipifica el acceso no consentido a un sistema informático con pena de tres a cinco años de privación de libertad.</p>
              <p>11.2. Asimismo, la Ley de Propiedad Intelectual prevé acciones civiles con multas que van de tres a cinco veces el valor total de las regalías que hubiere percibido el titular, más la correspondiente indemnización por daños y perjuicios, así como sanciones administrativas.</p>
              <p>11.3. EL DESARROLLADOR se reserva el derecho de ejercer todas las acciones legales disponibles en el ordenamiento jurídico ecuatoriano contra cualquier persona que infrinja sus derechos de propiedad intelectual.</p>

              <h3 className="font-bold text-neutral-900 dark:text-neutral-100 mt-6">CAPÍTULO V: PRIVACIDAD Y TRATAMIENTO DE DATOS PERSONALES</h3>
              <p><strong>Artículo 12. Marco Normativo Aplicable.</strong></p>
              <p>12.1. El tratamiento de datos personales realizado a través de LA PLATAFORMA se rige por las disposiciones de la Ley Orgánica de Protección de Datos Personales (LOPDP), publicada en el Registro Oficial Suplemento 459 de 26 de mayo de 2021, y por el artículo 66 numeral 19 de LA CONSTITUCIÓN, que reconoce y garantiza el derecho a la protección de datos de carácter personal, incluyendo el acceso y la decisión sobre información y datos de este carácter, así como su correspondiente protección.</p>
              <p>12.2. La recolección, archivo, procesamiento, distribución o difusión de datos personales requerirá la autorización del titular o el mandato de la ley, conforme al mandato constitucional precitado.</p>

              <p><strong>Artículo 13. Datos Recolectados y Finalidad del Tratamiento.</strong></p>
              <p>13.1. Para el funcionamiento de LA PLATAFORMA, EL DESARROLLADOR podrá recolectar los siguientes datos personales de EL USUARIO: nombre, dirección de correo electrónico, y datos financieros referenciales ingresados voluntariamente. La finalidad del tratamiento es exclusivamente la prestación del servicio experimental de registro y gestión de gastos financieros.</p>
              <p>13.2. EL USUARIO otorga su consentimiento expreso, libre, informado e inequívoco para el tratamiento de sus datos personales en los términos indicados. Este consentimiento podrá ser revocado en cualquier momento, en cuyo caso EL DESARROLLADOR procederá a la terminación inmediata del acceso a LA PLATAFORMA.</p>

              <p><strong>Artículo 14. Medidas de Seguridad.</strong></p>
              <p>14.1. EL DESARROLLADOR implementa medidas de seguridad técnicas, administrativas y organizativas proporcionales a la naturaleza experimental de LA PLATAFORMA. Sin embargo, EL USUARIO reconoce y acepta expresamente que:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>a) Al tratarse de un entorno Beta, las medidas de seguridad no son de grado bancario ni equivalentes a las exigidas a instituciones financieras reguladas;</li>
                <li>b) EL USUARIO asume el riesgo de posibles vulnerabilidades de seguridad inherentes a un sistema en fase de pruebas y exonera a EL DESARROLLADOR de cualquier responsabilidad por accesos no autorizados, filtración de datos o cualquier otro incidente de seguridad.</li>
              </ul>
              <p>14.2. En aplicación del artículo 7 de la LOPDP, el tratamiento de datos personales será legítimo y lícito cuando se cuente con el consentimiento del titular o cuando concurra una causa de legitimación prevista en dicha ley.</p>

              <p><strong>Artículo 15. Confidencialidad de los Mensajes de Datos.</strong></p>
              <p>15.1. En concordancia con el artículo 5 de la Ley de Comercio Electrónico, Firmas Electrónicas y Mensajes de Datos (Ley No. 67, Registro Oficial Suplemento 557 de 17 de abril de 2002), se establecen los principios de confidencialidad y reserva para los mensajes de datos. EL DESARROLLADOR tratará los datos ingresados con la debida confidencialidad, sin perjuicio de las limitaciones técnicas propias de la fase Beta antes señaladas.</p>

              <p><strong>Artículo 16. Derechos del Titular de los Datos.</strong></p>
              <p>16.1. EL USUARIO, en su calidad de titular de los datos personales, tiene derecho a ejercer los derechos de acceso, rectificación, cancelación, oposición, portabilidad y limitación del tratamiento, en los términos previstos en la LOPDP. Para el ejercicio de estos derechos, EL USUARIO deberá dirigir una comunicación por escrito al correo electrónico de contacto de EL DESARROLLADOR, acompañando copia de su documento de identidad.</p>

              <h3 className="font-bold text-neutral-900 dark:text-neutral-100 mt-6">CAPÍTULO VI: DISPOSICIONES GENERALES</h3>
              <p><strong>Artículo 17. Modificación de LOS TÉRMINOS.</strong></p>
              <p>17.1. EL DESARROLLADOR se reserva el derecho de modificar LOS TÉRMINOS en cualquier momento y sin previo aviso. Las modificaciones entrarán en vigor desde el momento de su publicación en LA PLATAFORMA o en el sitio web de EL DESARROLLADOR. Se recomienda a EL USUARIO revisar periódicamente LOS TÉRMINOS. El uso continuado de LA PLATAFORMA después de cualquier modificación implica la aceptación tácita de la misma.</p>

              <p><strong>Artículo 18. Legislación Aplicable y Jurisdicción Competente.</strong></p>
              <p>18.1. LOS TÉRMINOS se rigen e interpretan de conformidad con la legislación de la República del Ecuador, incluyendo pero no limitándose a LA CONSTITUCIÓN, el Código Civil, el Código Orgánico Integral Penal, la Ley de Comercio Electrónico, Firmas y Mensajes de Datos, la Ley Orgánica de Protección de Datos Personales y la Ley de Propiedad Intelectual.</p>
              <p>18.2. Para cualquier controversia que pudiera derivarse de la interpretación o ejecución de LOS TÉRMINOS, las partes se someten expresamente a la jurisdicción de los tribunales competentes del domicilio de EL DESARROLLADOR, con renuncia expresa a cualquier otro fuero que pudiera corresponderles.</p>

              <p><strong>Artículo 19. Nulidad Parcial.</strong></p>
              <p>19.1. Si cualquier disposición de LOS TÉRMINOS fuera declarada nula o inaplicable por autoridad judicial o administrativa competente, dicha nulidad no afectará la validez de las restantes disposiciones, que mantendrán su plena vigencia y eficacia.</p>

              <p><strong>Artículo 20. Aceptación Electrónica.</strong></p>
              <p>20.1. En aplicación del artículo 5 de la Ley de Comercio Electrónico, Firmas y Mensajes de Datos, que reconoce validez jurídica a los mensajes de datos, EL USUARIO acepta que el simple hecho de utilizar LA PLATAFORMA constituye una manifestación electrónica de su voluntad, equivalente a la firma manuscrita, y produce los mismos efectos jurídicos que la legislación ecuatoriana otorga a los documentos escritos.</p>

              <p><strong>Artículo 21. Contacto.</strong></p>
              <p>21.1. Para cualquier consulta, comunicación o notificación relacionada con LOS TÉRMINOS, EL USUARIO podrá dirigirse a EL DESARROLLADOR a través de la dirección de correo electrónico que conste en LA PLATAFORMA o en los canales oficiales que EL DESARROLLADOR habilite para tales efectos.</p>

              <p className="mt-6 font-bold text-center text-xs text-neutral-500 uppercase">AL HACER CLIC EN «ACEPTAR» O AL UTILIZAR LA PLATAFORMA DE CUALQUIER FORMA, EL USUARIO RECONOCE HABER LEÍDO, COMPRENDIDO Y ACEPTADO EN SU TOTALIDAD LOS PRESENTES TÉRMINOS Y CONDICIONES, OBLIGÁNDOSE A SU CUMPLIMIENTO IRRESTRICTO.</p>
            </div>
            <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowTerms(false)}
                className="py-3 px-6 text-sm font-bold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  setTermsAccepted(true);
                  setShowTerms(false);
                }}
                className="py-3 px-6 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all text-sm"
              >
                He leído y acepto los términos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
