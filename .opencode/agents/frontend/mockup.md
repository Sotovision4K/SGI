<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SGI Pro | Automatización de Sistemas Integrados de Gestión</title>
<style>
  /* ===== Reset & Base ===== */
  * { margin: 0; padding: 0; box-sizing: border-box; }
  
  :root {
    --primary: #0A2540;
    --accent: #0066CC;
    --accent-light: #E8F1FB;
    --text: #1A1F36;
    --text-muted: #5A6478;
    --bg: #FFFFFF;
    --bg-soft: #F7F9FC;
    --border: #E3E8EF;
    --success: #00875A;
    --radius: 8px;
    --shadow-sm: 0 1px 3px rgba(10, 37, 64, 0.06);
    --shadow-md: 0 4px 12px rgba(10, 37, 64, 0.08);
    --transition: all 0.25s ease;
  }
  
  html { scroll-behavior: smooth; }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    color: var(--text);
    background: var(--bg);
    line-height: 1.6;
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
  }
  
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
  }
  
  /* ===== Navbar ===== */
  .navbar {
    position: sticky;
    top: 0;
    background: rgba(255,255,255,0.95);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border);
    z-index: 100;
    padding: 16px 0;
  }
  
  .nav-inner {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .logo {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
    font-size: 20px;
    color: var(--primary);
    letter-spacing: -0.3px;
  }
  
  .logo-icon {
    width: 32px;
    height: 32px;
    background: var(--primary);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 14px;
    font-weight: 800;
  }
  
  .nav-links {
    display: flex;
    gap: 32px;
    list-style: none;
    align-items: center;
  }
  
  .nav-links a {
    color: var(--text-muted);
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    transition: var(--transition);
  }
  
  .nav-links a:hover { color: var(--accent); }
  
  /* ===== Buttons ===== */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    border-radius: var(--radius);
    font-weight: 600;
    font-size: 14px;
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition: var(--transition);
    font-family: inherit;
  }
  
  .btn-primary {
    background: var(--accent);
    color: white;
  }
  
  .btn-primary:hover {
    background: #0052A3;
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }
  
  .btn-secondary {
    background: transparent;
    color: var(--primary);
    border: 1px solid var(--border);
  }
  
  .btn-secondary:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  
  .btn-lg {
    padding: 16px 32px;
    font-size: 15px;
  }
  
  /* ===== Hero ===== */
  .hero {
    padding: 100px 0 80px;
    background: linear-gradient(180deg, var(--bg-soft) 0%, var(--bg) 100%);
  }
  
  .hero-inner {
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    gap: 60px;
    align-items: center;
  }
  
  .hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--accent-light);
    color: var(--accent);
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 20px;
  }
  
  .hero h1 {
    font-size: 52px;
    line-height: 1.1;
    font-weight: 800;
    letter-spacing: -1.5px;
    color: var(--primary);
    margin-bottom: 20px;
  }
  
  .hero h1 span { color: var(--accent); }
  
  .hero p {
    font-size: 18px;
    color: var(--text-muted);
    margin-bottom: 32px;
    max-width: 520px;
  }
  
  .hero-cta {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  
  .hero-visual {
    background: white;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px;
    box-shadow: var(--shadow-md);
  }
  
  .visual-header {
    display: flex;
    gap: 6px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }
  
  .visual-header span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--border);
  }
  
  .progress-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    background: var(--bg-soft);
    border-radius: var(--radius);
    margin-bottom: 10px;
  }
  
  .progress-icon {
    width: 36px;
    height: 36px;
    background: var(--accent-light);
    color: var(--accent);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 13px;
    flex-shrink: 0;
  }
  
  .progress-content { flex: 1; }
  
  .progress-content strong {
    display: block;
    font-size: 14px;
    color: var(--primary);
    margin-bottom: 4px;
  }
  
  .progress-bar {
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }
  
  .progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width 1s ease;
  }
  
  /* ===== Sections ===== */
  section { padding: 80px 0; }
  
  .section-header {
    text-align: center;
    max-width: 680px;
    margin: 0 auto 56px;
  }
  
  .section-tag {
    color: var(--accent);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    margin-bottom: 12px;
  }
  
  .section-header h2 {
    font-size: 38px;
    line-height: 1.2;
    color: var(--primary);
    letter-spacing: -0.8px;
    margin-bottom: 16px;
    font-weight: 700;
  }
  
  .section-header p {
    color: var(--text-muted);
    font-size: 17px;
  }
  
  /* ===== Features ===== */
  .features {
    background: var(--bg-soft);
  }
  
  .features-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
  
  .feature-card {
    background: white;
    padding: 32px;
    border-radius: 12px;
    border: 1px solid var(--border);
    transition: var(--transition);
  }
  
  .feature-card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-md);
    border-color: var(--accent);
  }
  
  .feature-icon {
    width: 44px;
    height: 44px;
    background: var(--accent-light);
    color: var(--accent);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    margin-bottom: 20px;
  }
  
  .feature-card h3 {
    font-size: 18px;
    color: var(--primary);
    margin-bottom: 10px;
  }
  
  .feature-card p {
    color: var(--text-muted);
    font-size: 15px;
  }
  
  /* ===== Consultant ===== */
  .consultant-inner {
    display: grid;
    grid-template-columns: 1fr 1.2fr;
    gap: 60px;
    align-items: center;
  }
  
  .consultant-card {
    background: linear-gradient(135deg, var(--primary) 0%, #1A3A5C 100%);
    color: white;
    padding: 40px;
    border-radius: 16px;
    position: relative;
    overflow: hidden;
  }
  
  .consultant-card::before {
    content: '';
    position: absolute;
    top: -50%;
    right: -50%;
    width: 300px;
    height: 300px;
    background: radial-gradient(circle, rgba(0,102,204,0.3) 0%, transparent 70%);
  }
  
  .consultant-avatar {
    width: 80px;
    height: 80px;
    background: var(--accent);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    font-weight: 700;
    margin-bottom: 20px;
    position: relative;
  }
  
  .consultant-card h3 {
    font-size: 22px;
    margin-bottom: 6px;
    position: relative;
  }
  
  .consultant-role {
    opacity: 0.8;
    font-size: 14px;
    margin-bottom: 20px;
    position: relative;
  }
  
  .credentials {
    list-style: none;
    position: relative;
  }
  
  .credentials li {
    padding: 10px 0;
    border-top: 1px solid rgba(255,255,255,0.1);
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
  }
  
  .credentials li::before {
    content: '✓';
    color: #4ADE80;
    font-weight: 700;
  }
  
  .consultant-text h2 {
    font-size: 36px;
    color: var(--primary);
    margin-bottom: 20px;
    letter-spacing: -0.8px;
    line-height: 1.2;
  }
  
  .consultant-text p {
    color: var(--text-muted);
    margin-bottom: 16px;
    font-size: 16px;
  }
  
  .scope-list {
    list-style: none;
    margin: 24px 0;
  }
  
  .scope-list li {
    padding: 8px 0;
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
    font-size: 15px;
  }
  
  .scope-list li::before {
    content: '→';
    color: var(--accent);
    font-weight: 700;
  }
  
  /* ===== Services ===== */
  .services { background: var(--bg-soft); }
  
  .services-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
  
  .service-card {
    background: white;
    padding: 36px 28px;
    border-radius: 12px;
    border: 1px solid var(--border);
    text-align: left;
    transition: var(--transition);
    position: relative;
  }
  
  .service-card:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow-md);
  }
  
  .service-badge {
    display: inline-block;
    background: var(--accent-light);
    color: var(--accent);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    margin-bottom: 14px;
  }
  
  .service-card h3 {
    font-size: 20px;
    color: var(--primary);
    margin-bottom: 10px;
  }
  
  .service-card p {
    color: var(--text-muted);
    font-size: 14px;
    margin-bottom: 16px;
  }
  
  .service-features {
    list-style: none;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  
  .service-features li {
    padding: 6px 0;
    font-size: 13px;
    color: var(--text-muted);
    display: flex;
    gap: 8px;
  }
  
  .service-features li::before {
    content: '•';
    color: var(--accent);
    font-weight: 700;
  }
  
  /* ===== Speed / Stats ===== */
  .speed {
    background: linear-gradient(135deg, var(--primary) 0%, #0F2B4F 100%);
    color: white;
    text-align: center;
  }
  
  .speed h2 {
    font-size: 38px;
    margin-bottom: 16px;
    letter-spacing: -0.8px;
  }
  
  .speed > .container > p {
    font-size: 17px;
    opacity: 0.85;
    max-width: 600px;
    margin: 0 auto 48px;
  }
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 24px;
    margin-bottom: 48px;
  }
  
  .stat {
    padding: 24px;
  }
  
  .stat-number {
    font-size: 44px;
    font-weight: 800;
    color: #4ADE80;
    letter-spacing: -1px;
    margin-bottom: 8px;
  }
  
  .stat-label {
    opacity: 0.8;
    font-size: 14px;
  }
  
  .speed .btn-primary {
    background: white;
    color: var(--primary);
  }
  
  .speed .btn-primary:hover {
    background: #E8F1FB;
  }
  
  /* ===== Final CTA ===== */
  .final-cta {
    text-align: center;
    padding: 100px 0;
  }
  
  .final-cta h2 {
    font-size: 42px;
    color: var(--primary);
    margin-bottom: 16px;
    letter-spacing: -1px;
  }
  
  .final-cta p {
    color: var(--text-muted);
    font-size: 18px;
    margin-bottom: 32px;
    max-width: 560px;
    margin-left: auto;
    margin-right: auto;
  }
  
  /* ===== Footer ===== */
  footer {
    background: var(--primary);
    color: white;
    padding: 40px 0;
    text-align: center;
    font-size: 14px;
    opacity: 0.9;
  }
  
  footer p { opacity: 0.7; margin-top: 8px; font-size: 13px; }
  
  /* ===== Modal ===== */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(10, 37, 64, 0.6);
    backdrop-filter: blur(4px);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 20px;
  }
  
  .modal-overlay.active { display: flex; }
  
  .modal {
    background: white;
    border-radius: 12px;
    padding: 40px;
    max-width: 480px;
    width: 100%;
    animation: slideUp 0.3s ease;
  }
  
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  .modal h3 {
    font-size: 24px;
    color: var(--primary);
    margin-bottom: 8px;
  }
  
  .modal p {
    color: var(--text-muted);
    margin-bottom: 24px;
  }
  
  .role-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 20px;
  }
  
  .role-option {
    padding: 20px;
    border: 2px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: var(--transition);
    text-align: center;
  }
  
  .role-option:hover {
    border-color: var(--accent);
    background: var(--accent-light);
  }
  
  .role-option .role-icon {
    font-size: 28px;
    margin-bottom: 8px;
  }
  
  .role-option strong {
    display: block;
    color: var(--primary);
    font-size: 15px;
    margin-bottom: 4px;
  }
  
  .role-option span {
    font-size: 12px;
    color: var(--text-muted);
  }
  
  .modal-close {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 14px;
    width: 100%;
    padding: 10px;
  }
  
  /* ===== Responsive ===== */
  @media (max-width: 900px) {
    .hero h1 { font-size: 38px; }
    .hero-inner, .consultant-inner { grid-template-columns: 1fr; gap: 40px; }
    .features-grid, .services-grid { grid-template-columns: 1fr; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .nav-links { display: none; }
    .section-header h2, .speed h2, .final-cta h2 { font-size: 28px; }
  }
</style>
</head>
<body>

<!-- ===== Navbar ===== -->
<nav class="navbar">
  <div class="container nav-inner">
    <div class="logo">
      <div class="logo-icon">SGI</div>
      <span>SGI Pro</span>
    </div>
    <ul class="nav-links">
      <li><a href="#features">Características</a></li>
      <li><a href="#consultant">Consultor</a></li>
      <li><a href="#services">Servicios</a></li>
      <li><a href="#" class="btn btn-primary" onclick="openModal(event)">Get Started</a></li>
    </ul>
  </div>
</nav>

<!-- ===== Hero ===== -->
<section class="hero">
  <div class="container hero-inner">
    <div>
      <div class="hero-badge">● Certificación ISO acelerada</div>
      <h1>Automatiza tu <span>Sistema Integrado de Gestión</span> con precisión</h1>
      <p>Implementa y mantén sistemas de gestión bajo las normas ISO 9001, ISO 14001 e ISO 45001 de forma guiada, rápida y confiable. Diseñado para empresas y consultores.</p>
      <div class="hero-cta">
        <a href="#" class="btn btn-primary btn-lg" onclick="openModal(event)">Get Started →</a>
        <a href="#features" class="btn btn-secondary btn-lg">Ver cómo funciona</a>
      </div>
    </div>
    <div class="hero-visual">
      <div class="visual-header">
        <span></span><span></span><span></span>
      </div>
      <div class="progress-item">
        <div class="progress-icon">9K</div>
        <div class="progress-content">
          <strong>ISO 9001 — Calidad</strong>
          <div class="progress-bar"><div class="progress-fill" style="width:85%"></div></div>
        </div>
      </div>
      <div class="progress-item">
        <div class="progress-icon">14K</div>
        <div class="progress-content">
          <strong>ISO 14001 — Ambiental</strong>
          <div class="progress-bar"><div class="progress-fill" style="width:62%"></div></div>
        </div>
      </div>
      <div class="progress-item">
        <div class="progress-icon">45K</div>
        <div class="progress-content">
          <strong>ISO 45001 — SST</strong>
          <div class="progress-bar"><div class="progress-fill" style="width:48%"></div></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ===== Features ===== -->
<section class="features" id="features">
  <div class="container">
    <div class="section-header">
      <div class="section-tag">Qué puedes hacer</div>
      <h2>Todo tu sistema de gestión en un solo lugar</h2>
      <p>Desde el diagnóstico inicial hasta las auditorías internas y el mantenimiento continuo del sistema.</p>
    </div>
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon">📋</div>
        <h3>Diagnóstico automatizado</h3>
        <p>Evaluación inicial del estado de tu empresa frente a los requisitos de la norma ISO seleccionada.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">📄</div>
        <h3>Documentación inteligente</h3>
        <p>Generación asistida de manuales, procedimientos, políticas y registros obligatorios.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">⚙️</div>
        <h3>Implementación guiada</h3>
        <p>Flujo paso a paso con tareas, responsables y cronograma para certificarte sin complicaciones.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🔍</div>
        <h3>Auditorías internas</h3>
        <p>Planifica, ejecuta y registra auditorías con listas de verificación preconfiguradas.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">📊</div>
        <h3>Indicadores y KPIs</h3>
        <p>Dashboards en tiempo real para medir el desempeño de tu SGI y tomar decisiones informadas.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🔄</div>
        <h3>Mantenimiento continuo</h3>
        <p>Alertas automáticas, seguimiento a hallazgos y gestión de la mejora continua.</p>
      </div>
    </div>
  </div>
</section>

<!-- ===== Consultant ===== -->
<section id="consultant">
  <div class="container consultant-inner">
    <div class="consultant-card">
      <div class="consultant-avatar">JC</div>
      <h3>Juan Consultor</h3>
      <div class="consultant-role">Consultor Senior en Sistemas de Gestión</div>
      <ul class="credentials">
        <li>Auditor Líder IRCA ISO 9001</li>
        <li>Certificación ISO 14001 Lead Implementer</li>
        <li>Auditor ISO 45001 – SST</li>
        <li>+10 años en implementación de SGI</li>
        <li>+50 empresas certificadas con éxito</li>
      </ul>
    </div>
    <div class="consultant-text">
      <div class="section-tag">El consultor detrás de la herramienta</div>
      <h2>Experiencia certificada y alcance integral</h2>
      <p>Nuestro consultor acompaña a empresas de todos los sectores en el camino hacia la certificación, combinando metodología probada con la potencia de la automatización.</p>
      <ul class="scope-list">
        <li>Asesoría personalizada en ISO 9001, 14001 y 45001</li>
        <li>Acompañamiento durante auditorías de certificación</li>
        <li>Capacitación a equipos internos</li>
        <li>Soporte en mantenimiento del sistema post-certificación</li>
      </ul>
      <a href="#" class="btn btn-primary" onclick="openModal(event)">Agendar con el consultor →</a>
    </div>
  </div>
</section>

<!-- ===== Services ===== -->
<section class="services" id="services">
  <div class="container">
    <div class="section-header">
      <div class="section-tag">Servicios</div>
      <h2>Soluciones diseñadas para cada etapa</h2>
      <p>Elige la norma que tu empresa necesita certificar. Cada servicio incluye implementación completa y mantenimiento.</p>
    </div>
    <div class="services-grid">
      <div class="service-card">
        <div class="service-badge">ISO 9001</div>
        <h3>Gestión de Calidad</h3>
        <p>Estandariza procesos, mejora la satisfacción del cliente y optimiza la eficiencia organizacional.</p>
        <ul class="service-features">
          <li>Mapeo de procesos</li>
          <li>Indicadores de calidad</li>
          <li>Control de no conformidades</li>
        </ul>
      </div>
      <div class="service-card">
        <div class="service-badge">ISO 14001</div>
        <h3>Gestión Ambiental</h3>
        <p>Identifica, controla y reduce el impacto ambiental de tu organización cumpliendo la normativa vigente.</p>
        <ul class="service-features">
          <li>Matriz de aspectos e impactos</li>
          <li>Gestión de requisitos legales</li>
          <li>Programas ambientales</li>
        </ul>
      </div>
      <div class="service-card">
        <div class="service-badge">ISO 45001</div>
        <h3>Seguridad y Salud en el Trabajo</h3>
        <p>Protege a tus colaboradores previniendo riesgos laborales y promoviendo entornos de trabajo seguros.</p>
        <ul class="service-features">
          <li>Matriz IPER</li>
          <li>Plan de emergencias</li>
          <li>Investigación de incidentes</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<!-- ===== Speed ===== -->
<section class="speed">
  <div class="container">
    <h2>Avanza hasta 3x más rápido</h2>
    <p>La automatización reduce drásticamente el tiempo de implementación y mantenimiento, sin sacrificar calidad ni cumplimiento.</p>
    <div class="stats-grid">
      <div class="stat">
        <div class="stat-number" data-target="70">0%</div>
        <div class="stat-label">Menos tiempo de implementación</div>
      </div>
      <div class="stat">
        <div class="stat-number" data-target="90">0%</div>
        <div class="stat-label">Reducción de documentación manual</div>
      </div>
      <div class="stat">
        <div class="stat-number" data-target="3">0x</div>
        <div class="stat-label">Más rápido que procesos tradicionales</div>
      </div>
      <div class="stat">
        <div class="stat-number" data-target="100">0%</div>
        <div class="stat-label">Trazabilidad garantizada</div>
      </div>
    </div>
    <a href="#" class="btn btn-primary btn-lg" onclick="openModal(event)">Comenzar ahora →</a>
  </div>
</section>

<!-- ===== Final CTA ===== -->
<section class="final-cta">
  <div class="container">
    <h2>¿Listo para certificar tu empresa?</h2>
    <p>Únete a decenas de organizaciones que ya automatizaron su Sistema Integrado de Gestión con SGI Pro.</p>
    <a href="#" class="btn btn-primary btn-lg" onclick="openModal(event)">Get Started Gratis →</a>
  </div>
</section>

<!-- ===== Footer ===== -->
<footer>
  <div class="container">
    <div class="logo" style="justify-content:center; color:white;">
      <div class="logo-icon" style="background:white; color:var(--primary);">SGI</div>
      <span>SGI Pro</span>
    </div>
    <p>© 2026 SGI Pro — Automatización de Sistemas Integrados de Gestión</p>
  </div>
</footer>

<!-- ===== Modal ===== -->
<div class="modal-overlay" id="modal">
  <div class="modal">
    <h3>Bienvenido a SGI Pro</h3>
    <p>Selecciona tu rol para personalizar tu experiencia:</p>
    <div class="role-options">
      <div class="role-option" onclick="selectRole('empresa')">
        <div class="role-icon">🏢</div>
        <strong>Soy una Empresa</strong>
        <span>Quiero certificarme</span>
      </div>
      <div class="role-option" onclick="selectRole('consultor')">
        <div class="role-icon">👤</div>
        <strong>Soy Consultor</strong>
        <span>Asesoro empresas</span>
      </div>
    </div>
    <button class="modal-close" onclick="closeModal()">Cancelar</button>
  </div>
</div>

<script>
  // Modal
  function openModal(e) {
    if (e) e.preventDefault();
    document.getElementById('modal').classList.add('active');
  }
  
  function closeModal() {
    document.getElementById('modal').classList.remove('active');
  }
  
  function selectRole(role) {
    alert(`¡Perfecto! Redirigiendo al onboarding de ${role === 'empresa' ? 'Empresa' : 'Consultor'}...`);
    closeModal();
  }
  
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });
  
  // Animación de stats al hacer scroll
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.dataset.target);
        const suffix = el.textContent.includes('x') ? 'x' : '%';
        let current = 0;
        const step = target / 40;
        const interval = setInterval(() => {
          current += step;
          if (current >= target) {
            current = target;
            clearInterval(interval);
          }
          el.textContent = Math.round(current) + suffix;
        }, 25);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  
  document.querySelectorAll('.stat-number').forEach(el => observer.observe(el));
</script>

</body>
</html>