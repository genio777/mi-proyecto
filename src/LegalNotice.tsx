import React from 'react';

export default function LegalNotice({titleId='legal-notice-title'}:{titleId?:string}) {
  return <aside className="legalNotice" role="note" aria-labelledby={titleId}>
    <h2 id={titleId}>Aplicación gratuita — aviso de uso y responsabilidad</h2>
    <p>Esta aplicación ofrece información orientativa. Su gratuidad no implica que las recargas sean gratuitas. Los datos, precios, disponibilidad, rutas y autonomía pueden contener errores o estar desactualizados. Confirma la información con el operador antes de viajar y utiliza la aplicación de forma segura.</p>
    <p>El uso y las decisiones de viaje son responsabilidad del usuario. En la medida permitida por la legislación aplicable, el autor no asume responsabilidad por daños, pérdidas o incidencias derivados de su utilización.</p>
  </aside>;
}
