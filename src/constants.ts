export const RETENTIONS = [
  { id: 'none', label: 'No aplica retención', percentage: 0 },
  { id: 'bienes', label: 'Adquisición de Bienes Muebles', percentage: 2 },
  { id: 'servicios_mano_obra', label: 'Servicios (Mano de Obra)', percentage: 3 },
  { id: 'servicios_profesionales_sociedades', label: 'Servicios Profesionales (Sociedades)', percentage: 5 },
  { id: 'honorarios_profesionales', label: 'Honorarios Profesionales (Personas)', percentage: 10 },
  { id: 'arrendamiento', label: 'Arrendamiento de Inmuebles', percentage: 10 },
  { id: 'publicidad', label: 'Publicidad y Medios de Comunicación', percentage: 3 },
  { id: 'construccion', label: 'Contratos de Construcción', percentage: 2 },
  { id: 'rimpe_emprendedor', label: 'RIMPE - Emprendedor', percentage: 1 },
  { id: 'rimpe_negocio_popular', label: 'RIMPE - Negocio Popular', percentage: 0 },
  { id: 'transporte', label: 'Transporte (Pasajeros y Carga)', percentage: 1 },
  { id: 'seguros', label: 'Seguros y Reaseguros', percentage: 2 },
  { id: 'retencion_con_iva', label: 'Retención con IVA', percentage: 0 },
  { id: 'retencion_sin_iva', label: 'Retención sin IVA', percentage: 0 },
  { id: 'otros', label: 'Conceptos NO Especificados', percentage: 3 },
];

export const DISCOUNTS = [
  { id: 'none', label: 'No aplica descuento' },
  { id: 'percentage', label: 'Porcentaje (%)' },
  { id: 'fixed', label: 'Valor Fijo ($)' },
];
