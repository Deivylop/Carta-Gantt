# Plan de Implementación: Módulo de Análisis de Riesgos (Monte Carlo)

## 📋 Resumen Ejecutivo

Este plan describe la implementación de un módulo de **Análisis de Riesgos con Simulación Monte Carlo** para gantt-cpm, inspirado en **Oracle Primavera Risk Analysis** (anteriormente Pertmaster). El módulo permitirá asignar distribuciones de probabilidad a las duraciones de actividades, ejecutar miles de iteraciones CPM, y generar análisis estadístico para determinar probabilidades de cumplimiento de plazos.

---

## 1. ¿Cómo funciona Primavera Risk Analysis?

### 1.1 Concepto General
Primavera Risk Analysis es una herramienta de análisis cuantitativo de riesgos para cronogramas. Su flujo principal:

1. **Importar cronograma** → Se carga un proyecto con actividades, duraciones y dependencias (desde P6 o similar)
2. **Definir incertidumbre** → Se asignan distribuciones de probabilidad a las duraciones de cada actividad (optimista, más probable, pesimista)
3. **Registrar riesgos** → Se crean eventos de riesgo con probabilidad de ocurrencia e impacto en duración/costo
4. **Ejecutar simulación Monte Carlo** → Miles de iteraciones (1,000–10,000), cada una:
   - Muestrea una duración aleatoria para cada actividad según su distribución
   - Evalúa si cada riesgo se materializa (según su probabilidad)
   - Ejecuta el cálculo CPM completo
   - Registra la fecha de término del proyecto
5. **Analizar resultados** → Histograma, curva S (CDF), diagrama tornado, índice de criticidad

### 1.2 Distribuciones Soportadas (Primavera)
| Distribución | Parámetros | Uso típico |
|---|---|---|
| **Triangular** | min, más probable, max | La más usada en construcción |
| **BetaPERT** | min, más probable, max | Suaviza los extremos vs. triangular |
| **Uniforme** | min, max | Mucha incertidumbre, sin valor más probable |
| **Normal** | media, desv. estándar | Cuando se tiene historial estadístico |
| **Lognormal** | media, desv. estándar | Duraciones con sesgo positivo |
| **Discreta** | valores y probabilidades | Escenarios específicos |

### 1.3 Métricas Clave de Salida
- **Probabilidad P10/P50/P80/P90**: "Hay un 80% de probabilidad de terminar antes del DD/MM/AAAA"
- **Índice de Criticidad (CI)**: % de iteraciones donde cada actividad está en la ruta crítica
- **Índice de Sensibilidad de Duración**: Correlación entre variación de duración de una actividad y variación del plazo del proyecto
- **Tornado Chart**: Ranking de actividades por impacto en el plazo total
- **Distribution Analyzer**: Histograma + CDF de la fecha de término

### 1.4 Registro de Riesgos
Primavera permite definir riesgos como eventos discretos:
- **Probabilidad** de ocurrencia (0-100%)
- **Impacto** en duración (días adicionales o multiplicador)
- **Actividades afectadas** (una o más)
- **Pre/Post mitigación** (antes y después de acciones correctivas)

---

## 2. Arquitectura Propuesta para gantt-cpm

### 2.1 Visión General

```
┌─────────────────────────────────────────────────────────┐
│                   RiskAnalysisPage                        │
│  ┌──────────┐  ┌────────────────────────────────────┐    │
│  │ Panel    │  │  Contenido principal                │    │
│  │ Lateral  │  │                                     │    │
│  │          │  │  Sub-tabs:                          │    │
│  │ • Config │  │  ┌─────────┬──────────┬──────────┐  │    │
│  │ • Riesgos│  │  │Distrib. │Resultados│Tornado   │  │    │
│  │ • Params │  │  │de Durac.│& CDF     │& Sensib. │  │    │
│  │          │  │  └─────────┴──────────┴──────────┘  │    │
│  │ [▶ Correr│  │                                     │    │
│  │  Simul.] │  │                                     │    │
│  └──────────┘  └────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Nuevos Archivos

```
src/
├── types/
│   └── risk.ts                      # Tipos: distribuciones, riesgos, resultados
├── utils/
│   └── monteCarloEngine.ts          # Motor de simulación Monte Carlo puro
├── components/
│   └── modules/
│       ├── RiskAnalysisPage.tsx      # Página principal del módulo
│       ├── RiskDistributionPanel.tsx # Tabla de distribuciones por actividad
│       ├── RiskRegisterPanel.tsx     # Registro de eventos de riesgo
│       ├── RiskResultsChart.tsx      # Histograma + CDF de fechas de término
│       ├── RiskTornadoChart.tsx      # Diagrama tornado de sensibilidad
│       └── RiskCriticalityTable.tsx  # Tabla de índice de criticidad
```

### 2.3 Archivos Existentes a Modificar

| Archivo | Cambio |
|---|---|
| `types/gantt.ts` | Agregar campo opcional `riskDist` a `Activity` |
| `ModuleTabs.tsx` | Agregar tab `'risk'` con ícono `Dice` |
| `App.tsx` | Importar y renderizar `RiskAnalysisPage` |
| `store/GanttContext.tsx` | Agregar estado de riesgos al state y acciones de dispatch |

---

## 3. Diseño de Tipos (`types/risk.ts`)

```typescript
// ═══════════════════════════════════════════════════════════════
// Risk Analysis Types – Monte Carlo Simulation
// ═══════════════════════════════════════════════════════════════

/** Tipos de distribución de probabilidad */
export type DistributionType = 
  | 'triangular'    // min, mostLikely, max
  | 'betaPERT'      // min, mostLikely, max (suavizado)
  | 'uniform'       // min, max
  | 'normal'        // mean, stdDev
  | 'lognormal'     // mean, stdDev  
  | 'discrete'      // values[] con probabilidades
  | 'none';         // sin incertidumbre (usa duración determinística)

/** Distribución de duración asignada a una actividad */
export interface DurationDistribution {
  type: DistributionType;
  /** Duración optimista (mínima) en días laborales */
  min?: number;
  /** Duración más probable en días laborales */
  mostLikely?: number;
  /** Duración pesimista (máxima) en días laborales */
  max?: number;
  /** Media (para Normal/Lognormal) */
  mean?: number;
  /** Desviación estándar (para Normal/Lognormal) */
  stdDev?: number;
  /** Valores discretos: [{value: días, probability: 0-1}] */
  discreteValues?: { value: number; probability: number }[];
}

/** Un evento de riesgo discreto */
export interface RiskEvent {
  id: string;
  name: string;
  description: string;
  /** Probabilidad de ocurrencia (0-100%) */
  probability: number;
  /** Actividades afectadas (IDs) */
  affectedActivityIds: string[];
  /** Impacto en duración: 'addDays' o 'multiply' */
  impactType: 'addDays' | 'multiply';
  /** Valor del impacto (días a agregar, o factor multiplicador) */
  impactValue: number;
  /** Estado pre/post mitigación */
  mitigated: boolean;
  /** Probabilidad post-mitigación (0-100%) */
  mitigatedProbability?: number;
  /** Impacto post-mitigación */
  mitigatedImpactValue?: number;
  /** Categoría del riesgo */
  category: RiskCategory;
  /** Responsable */
  owner: string;
  /** Notas */
  notes: string;
}

export type RiskCategory = 
  | 'Técnico' | 'Externo' | 'Organizacional' | 'Gestión'
  | 'Clima' | 'Suministro' | 'Regulatorio' | 'Diseño' 
  | 'Subcontrato' | 'Otro';

/** Parámetros de la simulación */
export interface SimulationParams {
  /** Número de iteraciones (típicamente 1000-10000) */
  iterations: number;
  /** Semilla del generador aleatorio (para reproducibilidad) */
  seed?: number;
  /** Usar distribución de riesgos pre o post mitigación */
  useMitigated: boolean;
  /** Nivel de confianza para reportes (ej: [10, 50, 80, 90]) */
  confidenceLevels: number[];
}

/** Resultado de una sola iteración */
export interface IterationResult {
  /** Fecha de término del proyecto en esta iteración */
  finishDate: Date;
  /** Duración total del proyecto (días laborales) */
  projectDuration: number;
  /** IDs de actividades que resultaron críticas */
  criticalActivityIds: string[];
  /** Duración muestreada de cada actividad */
  sampledDurations: Record<string, number>;
}

/** Resultado completo de la simulación */
export interface SimulationResult {
  /** Timestamp de ejecución */
  runAt: string;
  /** Parámetros usados */
  params: SimulationParams;
  /** Número de iteraciones completadas */
  completedIterations: number;
  /** Resultados por iteración */
  iterations: IterationResult[];
  
  // ── Métricas precalculadas ──
  /** Percentiles de fecha de término (P10, P50, P80, P90...) */
  datePercentiles: Record<number, Date>;
  /** Percentiles de duración del proyecto */
  durationPercentiles: Record<number, number>;
  /** Duración determinística (CPM sin incertidumbre) */
  deterministicDuration: number;
  /** Fecha determinística de término */
  deterministicFinish: Date;
  
  /** Índice de criticidad por actividad (0-100%) */
  criticalityIndex: Record<string, number>;
  /** Índice de sensibilidad por actividad (correlación) */
  sensitivityIndex: Record<string, number>;
  
  /** Histograma de fechas de término (bins) */
  histogram: { binStart: Date; binEnd: Date; count: number; cumPct: number }[];
}

/** Estado completo del módulo de riesgos */
export interface RiskAnalysisState {
  /** Distribuciones de duración por actividad */
  distributions: Record<string, DurationDistribution>;
  /** Registro de riesgos */
  riskEvents: RiskEvent[];
  /** Parámetros de simulación */
  params: SimulationParams;
  /** Resultado de la última simulación */
  lastResult: SimulationResult | null;
  /** ¿Simulación en progreso? */
  running: boolean;
  /** Progreso (0-100) */
  progress: number;
}
```

---

## 4. Motor Monte Carlo (`utils/monteCarloEngine.ts`)

### 4.1 Funciones Principales

```typescript
// Flujo de la simulación:
//
//  1. sampleDuration(dist)        → genera 1 duración aleatoria según distribución
//  2. applyRiskEvents(risks, rng) → decide qué riesgos se materializan
//  3. runIteration(acts, ...)     → clona actividades, aplica duraciones, ejecuta calcCPM
//  4. runSimulation(...)          → loop de N iteraciones + cálculo de estadísticas
//  5. computeStatistics(results)  → percentiles, criticidad, sensibilidad, histograma

/** Generador pseudo-aleatorio con semilla (Mulberry32) para reproducibilidad */
export function seededRandom(seed: number): () => number;

/** Muestrear una duración según la distribución asignada */
export function sampleDuration(dist: DurationDistribution, rng: () => number): number;
  // - triangular: inversión CDF triangular
  // - betaPERT: 4×mostLikely ponderado, muestreo Beta
  // - uniform: min + rng × (max - min)
  // - normal: Box-Muller transform
  // - lognormal: exp(normal sample)
  // - discrete: ruleta de probabilidades

/** Ejecutar una iteración completa */
export function runIteration(
  masterActivities: Activity[],
  distributions: Record<string, DurationDistribution>,
  riskEvents: RiskEvent[],
  useMitigated: boolean,
  projStart: Date,
  defCal: CalendarType,
  statusDate: Date | null,
  projName: string,
  activeBaselineIdx: number,
  customCalendars: CustomCalendar[],
  rng: () => number
): IterationResult;

/** Ejecutar la simulación completa (N iteraciones) */
export function runSimulation(
  params: SimulationParams,
  masterActivities: Activity[],
  distributions: Record<string, DurationDistribution>,
  riskEvents: RiskEvent[],
  projStart: Date,
  defCal: CalendarType,
  statusDate: Date | null,
  projName: string,
  activeBaselineIdx: number,
  customCalendars: CustomCalendar[],
  onProgress?: (pct: number) => void
): SimulationResult;

/** Calcular estadísticas agregadas */
export function computeStatistics(
  iterations: IterationResult[],
  confidenceLevels: number[],
  deterministicFinish: Date,
  deterministicDuration: number
): Omit<SimulationResult, 'runAt' | 'params' | 'completedIterations' | 'iterations'>;
```

### 4.2 Algoritmo de Muestreo por Distribución

| Distribución | Algoritmo |
|---|---|
| **Triangular** | Inversión CDF: `U < (mode-min)/(max-min)` → rama izquierda/derecha |
| **BetaPERT** | α=1+4×(mode-min)/(max-min), β=1+4×(max-mode)/(max-min), muestreo Beta |
| **Uniforme** | `min + U × (max - min)` |
| **Normal** | Box-Muller: `mean + stdDev × sqrt(-2 ln U₁) × cos(2π U₂)` |
| **Lognormal** | `exp(normalSample(ln(mean), stdDev))` |
| **Discreta** | Ruleta acumulativa |

### 4.3 Proceso de Cada Iteración

```
Para cada iteración i = 1..N:
  1. Clonar actividades master (deepCloneActivities)
  2. Para cada actividad con distribución asignada:
     a. Muestrear nueva duración: dur_i = sampleDuration(dist)
     b. Si actividad tiene pct > 0, solo variar remDur proporcionalmente
  3. Para cada riskEvent:
     a. Generar U ~ Uniform(0,1)
     b. Si U < probabilidad/100 → riesgo se materializa
     c. Aplicar impacto a actividades afectadas
  4. Ejecutar calcCPM completo con duraciones modificadas
  5. Extraer: finishDate, projectDuration, actividadesCriticas
  6. Guardar resultado de la iteración
```

### 4.4 Índice de Sensibilidad (Tornado)

Se calcula como **correlación de Spearman** entre:
- Las duraciones muestreadas de cada actividad (vector de N valores)
- La duración total del proyecto (vector de N valores)

Las actividades con mayor correlación |ρ| tienen mayor impacto en el plazo.

### 4.5 Rendimiento

- **Web Worker**: La simulación se ejecutará en un Web Worker para no bloquear la UI
- **Batch processing**: Se envían iteraciones en lotes con reportes de progreso
- **1,000 iteraciones** con 50 actividades y CPM ≈ 2-5 segundos
- **10,000 iteraciones** ≈ 15-30 segundos (recomendado en background)

---

## 5. Componentes de UI

### 5.1 RiskAnalysisPage (Página Principal)

**Layout**: Panel lateral izquierdo (config/riesgos) + área principal con sub-tabs

**Sub-tabs**:
1. **Distribuciones** — Tabla editable: actividad | distribución tipo | min | ML | max
2. **Registro de Riesgos** — CRUD de eventos de riesgo
3. **Resultados** — Histograma + CDF interactivo
4. **Tornado & Sensibilidad** — Diagrama tornado + tabla de criticidad

### 5.2 Panel de Configuración (Sidebar)
- Selector de iteraciones (1000 / 5000 / 10000)
- Checkbox "Usar valores post-mitigación"
- Niveles de confianza configurables (P10, P50, P80, P90)
- Semilla aleatoria (opcional, para reproducibilidad)
- Botón **▶ Ejecutar Simulación** (con barra de progreso)
- Resumen rápido: "P80 = 45 días | 15-Mar-2026"

### 5.3 RiskDistributionPanel (Sub-tab 1: "Distribuciones")

Tabla con todas las actividades del proyecto (no summary, no milestone):

| # | Actividad | Duración Det. | Distribución | Min | Más Probable | Max |
|---|---|---|---|---|---|---|
| 1 | Excavación | 10d | Triangular | 8d | 10d | 15d |
| 2 | Fundaciones | 20d | BetaPERT | 16d | 20d | 30d |
| 3 | Estructuras | 15d | (sin riesgo) | — | — | — |

- Click en celda para editar
- Selector de tipo de distribución (dropdown)
- Botón "Aplicar a todas" (distribución por defecto: ±20% triangular)
- Mini-gráfico de la distribución al hover
- Código de color: verde (baja incertidumbre), amarillo (media), rojo (alta)

### 5.4 RiskRegisterPanel (Sub-tab 2: "Registro de Riesgos")

Tabla CRUD:

| Riesgo | Prob. | Impacto | Actividades | Categoría | Mitigado |
|---|---|---|---|---|---|
| Lluvia prolongada | 40% | +5d | Excavación, Fundaciones | Clima | ☐ |
| Retraso material | 25% | ×1.3 | Estructuras | Suministro | ☑ → 10% |

- Modal para crear/editar riesgo con selector de actividades afectadas
- Toggle pre/post mitigación para ver el efecto
- Importar/exportar como JSON

### 5.5 RiskResultsChart (Sub-tab 3: "Resultados")

**Histograma + CDF combinados** (gráfico principal):
- Eje X: Fecha de término del proyecto (o duración en días)
- Eje Y izquierdo: Frecuencia (barras del histograma)
- Eje Y derecho: Probabilidad acumulada % (curva S)
- Líneas verticales para P10, P50, P80, P90 con etiquetas
- Línea punteada roja: fecha determinística (CPM sin riesgo)
- Toggle días/fechas en eje X

**Tabla de percentiles**:
| Nivel | Duración | Fecha | Delta vs Det. |
|---|---|---|---|
| P10 | 38d | 01-Mar-2026 | −2d |
| P50 | 43d | 08-Mar-2026 | +3d |
| P80 | 48d | 15-Mar-2026 | +8d |
| P90 | 52d | 21-Mar-2026 | +12d |
| Det. | 40d | 03-Mar-2026 | — |

### 5.6 RiskTornadoChart (Sub-tab 4: "Tornado & Sensibilidad")

**Diagrama Tornado**:
- Barras horizontales, ordenadas de mayor a menor impacto
- Cada barra muestra: [Duración si Min ← Duración base → Duración si Max]
- Los colores indican rango de variación
- Top 10 o Top 15 actividades más sensibles

**Tabla de Índice de Criticidad**:
| Actividad | CI (%) | Sensibilidad (ρ) | TF Promedio | En ruta crítica Det. |
|---|---|---|---|---|
| Excavación | 92% | 0.78 | 0.3d | ✓ |
| Fundaciones | 87% | 0.71 | 1.2d | ✓ |
| Inst. Eléctrica | 45% | 0.32 | 5.1d | ✗ |

---

## 6. Integración con el Estado (GanttContext)

### 6.1 Nuevos campos en el State

```typescript
// En GanttContext state:
riskDistributions: Record<string, DurationDistribution>;  // activityId → distribución
riskEvents: RiskEvent[];                                    // registro de riesgos
riskSimParams: SimulationParams;                           // parámetros de simulación
riskSimResult: SimulationResult | null;                    // último resultado
riskSimRunning: boolean;                                    // simulación en curso
riskSimProgress: number;                                    // progreso 0-100
```

### 6.2 Nuevas Acciones de Dispatch

```typescript
// Acciones para el módulo de riesgos:
| { type: 'SET_RISK_DISTRIBUTION'; activityId: string; dist: DurationDistribution }
| { type: 'SET_RISK_DISTRIBUTIONS_BULK'; distributions: Record<string, DurationDistribution> }
| { type: 'ADD_RISK_EVENT'; event: RiskEvent }
| { type: 'UPDATE_RISK_EVENT'; event: RiskEvent }
| { type: 'DELETE_RISK_EVENT'; eventId: string }
| { type: 'SET_RISK_SIM_PARAMS'; params: Partial<SimulationParams> }
| { type: 'RISK_SIM_START' }
| { type: 'RISK_SIM_PROGRESS'; progress: number }
| { type: 'RISK_SIM_COMPLETE'; result: SimulationResult }
| { type: 'RISK_SIM_CANCEL' }
```

### 6.3 Persistencia

- **localStorage**: Se guardarán `riskDistributions`, `riskEvents`, `riskSimParams` y `riskSimResult` como parte del proyecto (meta-actividad `__RISK__`)
- **Supabase**: Nueva tabla `gantt_risk_distributions` y `gantt_risk_events` (fase posterior)

---

## 7. Integración con CPM Existente

### 7.1 Reutilización del Motor CPM

El motor Monte Carlo reusará directamente:
- **`deepCloneActivities()`** de `whatIfEngine.ts` — para crear copia aislada en cada iteración
- **`calcCPM()`** de `cpm.ts` — para ejecutar el cálculo de ruta crítica con duraciones modificadas
- **`calWorkDays()`** de `cpm.ts` — para métricas de duración en días laborales

### 7.2 Actividades Parcialmente Completadas

Para actividades con progreso > 0:
- Solo se varía la **duración remanente** (`remDur`), no la duración total
- Si `pct = 100%` → la actividad no se simula (ya terminó)
- Fórmula: `newRemDur = sampleDuration(dist) × (1 - pct/100)`

### 7.3 Calendario

Cada iteración respeta el calendario del proyecto y calendarios custom asignados:
- `defCal`, `customCalendars` se pasan tal cual a `calcCPM`
- Las distribuciones muestrean en **días laborales** según el calendario de la actividad

---

## 8. Fases de Implementación

### Fase 1: Foundation (Core) — ~2-3 sesiones
1. ✏️ Crear `types/risk.ts` con todos los tipos
2. ✏️ Crear `utils/monteCarloEngine.ts`:
   - `seededRandom()` — generador con semilla
   - `sampleDuration()` — todas las distribuciones
   - `runIteration()` — una iteración completa
   - `runSimulation()` — loop con progreso
   - `computeStatistics()` — percentiles, criticidad, tornado
3. ✏️ Agregar estado de riesgos a `GanttContext.tsx`
4. ✏️ Agregar tab `'risk'` a `ModuleTabs.tsx`
5. ✏️ Crear `RiskAnalysisPage.tsx` básico con layout

### Fase 2: UI de Distribuciones — ~1-2 sesiones
6. ✏️ Crear `RiskDistributionPanel.tsx` — tabla de distribuciones por actividad
7. ✏️ Botón "Aplicar distribución por defecto" (±20% triangular)
8. ✏️ Mini-preview de distribución (SVG sparkline)

### Fase 3: Registro de Riesgos — ~1-2 sesiones
9. ✏️ Crear `RiskRegisterPanel.tsx` — CRUD de riesgos
10. ✏️ Modal de creación/edición con selector de actividades
11. ✏️ Toggle pre/post mitigación

### Fase 4: Ejecución y Resultados — ~2-3 sesiones
12. ✏️ Integrar botón "Ejecutar Simulación" con barra de progreso
13. ✏️ Crear `RiskResultsChart.tsx` — Histograma + CDF con Canvas/SVG
14. ✏️ Tabla de percentiles con semáforo de colores
15. ✏️ (Opcional) Web Worker para no bloquear UI

### Fase 5: Tornado & Sensibilidad — ~1-2 sesiones
16. ✏️ Crear `RiskTornadoChart.tsx` — Diagrama tornado SVG
17. ✏️ Crear `RiskCriticalityTable.tsx` — Tabla de criticidad
18. ✏️ Correlación de Spearman para índice de sensibilidad

### Fase 6: Persistencia y Polish — ~1 sesión
19. ✏️ Guardar/restaurar risk data en localStorage (meta `__RISK__`)
20. ✏️ Persistir en auto-save
21. ✏️ Validaciones (min < ML < max, etc.)

### Fase 7 (Futura): Supabase y Avanzado
22. Schema SQL para `gantt_risk_distributions` y `gantt_risk_events`
23. Correlación entre actividades
24. Análisis de costo (además de duración)
25. Importar/exportar distribuciones (CSV/JSON)

---

## 9. Dependencias Externas

**Ninguna librería externa nueva requerida.** Todo se implementa con:
- **Canvas/SVG** nativo para gráficos (como ya se hace en GanttTimeline y SCurveChart)
- **Algoritmos estadísticos** implementados en TypeScript puro
- **Web Worker API** nativa del browser (opcional, para iteraciones > 5000)

Si el rendimiento de gráficos fuera un problema futuro, se podría considerar agregar una librería como `lightweight-charts` o `d3-scale`, pero el plan es mantener **zero new dependencies**.

---

## 10. Resumen de Entregables

| # | Entregable | Archivos | Prioridad |
|---|---|---|---|
| 1 | Tipos de riesgo | `types/risk.ts` | Alta |
| 2 | Motor Monte Carlo | `utils/monteCarloEngine.ts` | Alta |
| 3 | Estado en GanttContext | `store/GanttContext.tsx` (mod) | Alta |
| 4 | Tab + routing | `ModuleTabs.tsx` + `App.tsx` (mod) | Alta |
| 5 | Página principal | `RiskAnalysisPage.tsx` | Alta |
| 6 | Panel distribuciones | `RiskDistributionPanel.tsx` | Alta |
| 7 | Registro de riesgos | `RiskRegisterPanel.tsx` | Media |
| 8 | Histograma + CDF | `RiskResultsChart.tsx` | Alta |
| 9 | Tornado chart | `RiskTornadoChart.tsx` | Media |
| 10 | Tabla criticidad | `RiskCriticalityTable.tsx` | Media |
| 11 | Persistencia localStorage | GanttContext (mod) | Alta |
| 12 | Web Worker | `workers/monteCarloWorker.ts` | Baja |

---

## 11. Ejemplo de UX Flow

1. Usuario abre proyecto → va al tab **"Análisis de Riesgos"**
2. Ve la tabla de distribuciones vacía → click **"Aplicar distribución por defecto"**
   - Se asigna Triangular(−20%, dur, +30%) a todas las actividades task
3. Ajusta manualmente "Excavación" → BetaPERT(8, 10, 18)
4. Va al sub-tab **"Registro de Riesgos"** → agrega "Lluvia prolongada" (40%, +5d en Excavación)
5. Configura 5,000 iteraciones → click **▶ Ejecutar Simulación**
6. Ve barra de progreso → 3 segundos
7. Aparecen resultados:
   - Histograma con la distribución de fechas de término
   - "P80 = 15-Mar-2026 (48 días)" ← 8 días más que el CPM determinístico
   - "P50 = 08-Mar-2026 (43 días)" ← 3 días más
8. Va al sub-tab **"Tornado"** → ve que "Excavación" es la actividad más sensible (ρ = 0.78)
9. Decide mitigar el riesgo de lluvia → marca como mitigado (10%, +2d)
10. Re-ejecuta simulación → P80 baja a 13-Mar-2026

---

*Plan creado para revisión. ¿Procedo con la implementación?*
