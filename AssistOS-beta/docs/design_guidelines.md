# AssistOS Design Guidelines

## Overview
AssistOS é uma plataforma de automação empresarial com IA, apresentando um design moderno, profissional e focado em conversação. O design reflete inteligência, confiança e simplicidade.

## Color Palette

### Primary Colors
```css
--navy-dark: 10 22 40        /* #0A1628 - Hero background, secções principais */
--navy-medium: 26 40 64      /* #1A2840 - Secções alternadas */
--navy-light: 30 58 96       /* #1E3A60 - Hover states, elevações */
```

### Accent Colors
```css
--blue-accent: 59 130 246    /* #3B82F6 - CTAs primários, ícones */
--blue-glow: 96 165 250      /* #60A5FA - Hover states, highlights */
--blue-dark: 37 99 235       /* #2563EB - Pressed states */
```

### Text Colors
```css
--text-primary: 249 250 251  /* #F9FAFB - Títulos, texto principal */
--text-secondary: 209 213 219 /* #D1D5DB - Corpo de texto, descrições */
--text-muted: 156 163 175    /* #9CA3AF - Texto terciário, labels */
```

### Borders & Backgrounds
```css
--border-subtle: 55 65 81    /* #374151 - Inputs, separadores */
--background-card: 17 24 39  /* #111827 - Cards, painéis */
--background-elevated: 31 41 55 /* #1F2937 - Elementos elevados */
```

## Typography

### Font Stack
- **Primary:** Inter, system-ui, -apple-system, sans-serif
- **Monospace:** 'Fira Code', 'Courier New', monospace (para código/dados técnicos)

### Scale
```css
--text-xs: 0.75rem      /* 12px - Labels pequenos */
--text-sm: 0.875rem     /* 14px - Corpo secundário */
--text-base: 1rem       /* 16px - Corpo principal */
--text-lg: 1.125rem     /* 18px - Subtítulos */
--text-xl: 1.25rem      /* 20px - Títulos secção */
--text-2xl: 1.5rem      /* 24px - Títulos grandes */
--text-3xl: 1.875rem    /* 30px - Headers */
--text-4xl: 2.25rem     /* 36px - Hero secundário */
--text-5xl: 3rem        /* 48px - Hero principal */
--text-6xl: 3.75rem     /* 60px - Display */
```

### Font Weights
- **Regular:** 400 (corpo de texto)
- **Medium:** 500 (labels, botões)
- **Semibold:** 600 (títulos de secção)
- **Bold:** 700 (hero titles, CTAs)

## Spacing

### Scale (Tailwind-based)
```
spacing-1: 0.25rem   /* 4px */
spacing-2: 0.5rem    /* 8px */
spacing-3: 0.75rem   /* 12px */
spacing-4: 1rem      /* 16px */
spacing-6: 1.5rem    /* 24px */
spacing-8: 2rem      /* 32px */
spacing-12: 3rem     /* 48px */
spacing-16: 4rem     /* 64px */
spacing-24: 6rem     /* 96px */
spacing-32: 8rem     /* 128px */
```

### Usage
- **Micro spacing:** 4-8px (botões, labels)
- **Medium spacing:** 16-24px (entre elementos relacionados)
- **Large spacing:** 48-96px (entre secções)

## Components

### Buttons

#### Primary (CTAs principais)
```
Background: blue-accent (#3B82F6)
Text: white
Padding: 12px 24px
Border-radius: 8px
Hover: blue-glow (#60A5FA)
Active: blue-dark (#2563EB)
```

#### Secondary (ações alternativas)
```
Background: transparent
Border: 1px solid border-subtle
Text: text-primary
Padding: 12px 24px
Border-radius: 8px
Hover: background-card
```

#### Ghost (navegação, links)
```
Background: transparent
Text: text-secondary
Padding: 8px 16px
Hover: text-primary + background subtil
```

### Input Fields

#### Text Input (Chat field no hero)
```
Background: transparent ou background-card
Border: 1px solid border-subtle
Padding: 16px 24px
Border-radius: 12px
Font-size: 18px
Placeholder: text-muted
Focus: border blue-accent + glow sutil
```

### Cards

#### Agent Cards (Secção 4)
```
Background: background-card
Border: 1px solid border-subtle
Border-radius: 12px
Padding: 24px
Hover: elevação sutil + border blue-accent
```

#### Feature Cards (Secção 3)
```
Background: background-elevated
Border: none
Border-radius: 8px
Padding: 32px
Icon: 48px, blue-accent
```

## Layout

### Container
```
Max-width: 1280px (xl)
Padding horizontal: 24px (mobile), 48px (tablet), 64px (desktop)
```

### Grid
```
Columns: 12
Gap: 24px
```

### Sections
```
Padding vertical: 80px (mobile), 120px (desktop)
Background: alternar navy-dark / navy-medium
```

## Animations

### Timing
```
--duration-fast: 150ms
--duration-normal: 300ms
--duration-slow: 500ms
```

### Easing
```
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55)
```

### Scroll Reveal
- **Fade in + translate up:** opacity 0→1, translateY 20px→0
- **Stagger:** 100ms entre elementos
- **Threshold:** 0.1 (trigger quando 10% visível)

### Hover States
- **Scale:** 1.0 → 1.02 (botões)
- **Glow:** box-shadow 0→subtle (cards)
- **Color:** smooth transition 200ms

## Iconography

### Library
Lucide React (consistente com Shadcn UI)

### Sizes
```
Small: 16px (inline com texto)
Medium: 24px (botões, features)
Large: 48px (hero, secções principais)
X-Large: 64px (displays especiais)
```

### Style
- **Stroke width:** 2px (padrão)
- **Color:** Herdar do parent ou blue-accent para destaque

## Responsive Breakpoints

```css
sm: 640px   /* Mobile large */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop small */
xl: 1280px  /* Desktop */
2xl: 1536px /* Desktop large */
```

### Layout Adjustments
- **Mobile (< 768px):** Stack vertical, padding reduzido, font sizes menores
- **Tablet (768-1024px):** 2 colunas, spacing intermédio
- **Desktop (> 1024px):** Full grid, spacing completo

## Dark Mode
AssistOS utiliza **apenas dark mode** (sem toggle). Todo o design é otimizado para fundos escuros.

## Accessibility

### Contrast Ratios
- **Texto principal:** Mínimo 7:1 (AAA)
- **Texto secundário:** Mínimo 4.5:1 (AA)
- **Interactive elements:** Mínimo 3:1

### Focus States
```
outline: 2px solid blue-accent
outline-offset: 2px
```

### Motion
- Respeitar `prefers-reduced-motion`
- Desativar animações se necessário

## Voice & Tone

### Messaging
- **Direto e confiante:** "Automatiza a tua empresa"
- **Guiar sem sobrecarregar:** "Eu guio-te passo a passo"
- **Foco em resultados:** "Em minutos, não em meses"

### Language
- Português (Portugal)
- Tom profissional mas acessível
- Evitar jargão técnico excessivo

## Special Elements

### Hero Chat Field
```
Width: Max 800px
Height: 60px
Font-size: 18px
Border-radius: 999px (pill shape)
Shadow: Glow azul subtil
Icon button: Circular, 48px, blue-accent
Placeholder: "Bem-vindo ao Assist Start — começa aqui a tua jornada..."
```

### Section Headers
```
Font-size: 48px (desktop), 36px (mobile)
Font-weight: 700
Line-height: 1.2
Margin-bottom: 16px
Color: text-primary
```

### Logo
- Ícone azul + texto "assistOS"
- Height: 32px (navbar), 48px (footer)
- Color: text-primary

## Futuristic Visual Effects

### Geometric Network Background
```
Visual: Linhas conectadas formando malha neural
Cores: Purple (#7C3AED) + Blue (#3B82F6) com opacity 0.15-0.3
Animação: Flutuação suave, pulse nos nós
Uso: Hero section, secções chave
```

### Glowing Particles
```
Tamanho: 2-8px
Cores: Purple/Blue com glow
Animação: Float + fade in/out
Densidade: Baixa (não sobrecarregar)
```

### Gradient Overlays
```
Radial gradients: Purple → transparent
Background: Navy dark base sempre visível
Blend mode: Screen ou lighten
Opacity: 10-20% para subtileza
```

### Tech Elements
- Geometric mesh patterns (SVG)
- Animated connection lines
- Glowing nodes at intersections
- Depth through blur and gradients
- Sci-fi aesthetic mantendo profissionalismo

## Implementation Notes

- Use Tailwind CSS para consistência
- Componentes Shadcn UI como base
- Adicionar classes customizadas em index.css para cores específicas
- Animações com Framer Motion quando apropriado
- Lazy loading para imagens/secções
- SVG patterns para backgrounds geométricos
- CSS keyframes para animações de partículas

## Performance

- Otimizar imagens (WebP, lazy loading)
- Code splitting por rota
- Minimizar animações em mobile
- First Contentful Paint < 1.5s
- Time to Interactive < 3s
- GPU acceleration para animações (transform, opacity)
- Reduzir partículas em dispositivos com bateria baixa
