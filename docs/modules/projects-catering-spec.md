# Projects Module - Catering Events Specification
## Tailor Meal Configuration Guide

This document specifies the Projects module configuration for catering event management.
It serves as the reference for AssistBuild to configure and customize the module.

---

## Module Overview

**Module ID:** `projects`
**Tenant:** Tailor Meal (464d1492-ff64-4e11-814e-b4e416b9c250)
**Purpose:** Complete event lifecycle management from lead conversion to post-event evaluation

---

## Tab Structure (10 Tabs)

### Tab 1: Ficha do Evento (Event Sheet) - Primary Tab

**Purpose:** Core event information and service details

| Field | Type | Required | Source |
|-------|------|----------|--------|
| `event_name` | text | Yes | CSV: "Nome do Evento" |
| `event_type` | select | Yes | Casamento, Corporativo, Aniversário, Batizado, Natal, etc. |
| `event_date` | date | Yes | CSV: "Data" |
| `client_arrival_time` | time | Yes | CSV: "Hora chegada cliente" |
| `location` | text | Yes | CSV: "Local" |
| `client_name` | link:clients | Yes | CSV: "Cliente" |
| `client_representative` | text | No | CSV: "Representação do cliente (dia)" |
| `representative_contact` | phone | No | Contact number |
| `client_style` | textarea | No | CSV: "Estilo do cliente" - notes about formality |
| `service_type` | select | Yes | Buffet, Empratado, Cocktail, Misto |
| `total_guests` | number | Yes | Total number |
| `adults` | number | Yes | Adult count |
| `children` | number | No | Children count |
| `babies` | number | No | Baby count |
| `menu_selected` | select | Yes | Base, Premium, Luxo, Custom |
| `materials_selected` | text | No | CSV: "Materiais escolhidos" |
| `client_materials` | textarea | No | What client provides |
| `dietary_restrictions` | textarea | No | Special diets, allergies |
| `staff_count_tailor` | number | Yes | Tailor Meal staff |
| `staff_count_client` | number | No | Client-side staff |
| `ceremony_location` | text | No | Church/ceremony details |
| `team_arrival` | time | Yes | When team arrives |
| `service_start` | time | Yes | Service start time |
| `service_end` | time | Yes | Service end time |
| `departure_time` | time | No | When team leaves |
| `event_coordinator` | link:users | Yes | Main coordinator |
| `head_chef` | text | No | Kitchen manager |
| `room_manager` | text | No | Room/service manager |
| `room_team` | text | No | Team composition |
| `logistics_responsible` | text | No | Logistics person |
| `important_notes` | textarea | No | Key observations |
| `status` | select | Yes | planning, confirmed, in_progress, completed, cancelled |

**Checklist Section (embedded in Tab 1):**
| Indicator | Type |
|-----------|------|
| Últimos ajustes do cliente | checkbox |
| Revisão do menu | checkbox |
| Número de convidados (final) | checkbox |
| Logística de transporte | checkbox |
| Equipamento e material embalado | checkbox |
| Confirmação da equipa | checkbox |
| Interação com outras equipas parceiras | checkbox |
| Briefing pronto para distribuir | checkbox |

---

### Tab 2: Ementa (Final Menu)

**Purpose:** Definitive menu for production kitchen

| Field | Type | Required |
|-------|------|----------|
| `menu_sections` | array | Yes |
| └ `section_name` | text | Yes | (Entradas, Prato Principal, Sobremesas) |
| └ `items` | array | Yes |
|   └ `item_name` | text | Yes |
|   └ `quantity` | number | Yes |
|   └ `unit` | select | (unidades, kg, porções) |
|   └ `preparation_notes` | text | No |
|   └ `allergens` | multiselect | No |
| `vegetarian_option` | textarea | No |
| `children_menu` | textarea | No |
| `production_notes` | textarea | No |
| `menu_approved` | boolean | No |
| `approved_by` | link:users | No |
| `approved_at` | datetime | No |

---

### Tab 3: Materiais Necessários (Required Materials)

**Purpose:** Equipment and materials checklist

| Field | Type | Required |
|-------|------|----------|
| `materials` | array | Yes |
| └ `category` | select | Yes | (Texteis, Loiça, Copos, Talheres, Cozinha, Decoração) |
| └ `item_name` | text | Yes |
| └ `quantity_needed` | number | Yes |
| └ `quantity_available` | number | No | (from warehouse) |
| └ `supplier` | text | No |
| └ `notes` | text | No |
| └ `checked` | boolean | No |
| `total_items` | computed | - |
| `missing_items` | computed | - |

---

### Tab 4: Armazém Virtual (Virtual Warehouse)

**Purpose:** Stock allocation and availability tracking

| Field | Type | Required |
|-------|------|----------|
| `warehouse_allocations` | array | Yes |
| └ `item_id` | link:inventory | Yes |
| └ `item_name` | text | Yes |
| └ `quantity_reserved` | number | Yes |
| └ `reservation_date` | date | Yes |
| └ `pickup_date` | date | No |
| └ `return_date` | date | No |
| └ `status` | select | Yes | (reserved, picked, returned, damaged) |
| `conflicts` | computed | - | Shows if items double-booked |

---

### Tab 5: Alinhamento (Event Timeline)

**Purpose:** Minute-by-minute event schedule

| Field | Type | Required |
|-------|------|----------|
| `timeline_items` | array | Yes |
| └ `time` | time | Yes |
| └ `moment` | text | Yes |
| └ `responsible` | text | No |
| └ `notes` | text | No |
| └ `completed` | boolean | No |
| `key_moments` | textarea | No |
| `contingency_plan` | textarea | No |

---

### Tab 6: Equipa (Team)

**Purpose:** Staff allocation and schedules

| Field | Type | Required |
|-------|------|----------|
| `team_members` | array | Yes |
| └ `name` | text | Yes |
| └ `role` | select | Yes | (Coordenador, Chefe Cozinha, Cozinheiro, Chefe Sala, Empregado Mesa, Logística, Copeiro) |
| └ `arrival_time` | time | Yes |
| └ `departure_time` | time | No |
| └ `contact` | phone | No |
| └ `notes` | text | No |
| `total_team_size` | computed | - |
| `briefing_completed` | boolean | No |
| `briefing_notes` | textarea | No |

---

### Tab 7: Custos (Costs)

**Purpose:** Event cost tracking

| Field | Type | Required |
|-------|------|----------|
| `cost_items` | array | Yes |
| └ `category` | select | Yes | (Mão-de-obra, Alimentação, Materiais, Transporte, Aluguer, Outros) |
| └ `description` | text | Yes |
| └ `quantity` | number | No |
| └ `unit_cost` | currency | Yes |
| └ `total_cost` | computed | - |
| └ `supplier` | text | No |
| └ `invoice_ref` | text | No |
| `labor_cost` | computed | - |
| `materials_cost` | computed | - |
| `total_cost` | computed | - |

---

### Tab 8: Faturação (Invoicing)

**Purpose:** Billing and payment tracking

| Field | Type | Required |
|-------|------|----------|
| `invoices` | array | No |
| └ `invoice_number` | text | Yes |
| └ `invoice_date` | date | Yes |
| └ `amount` | currency | Yes |
| └ `status` | select | Yes | (draft, sent, paid, overdue, cancelled) |
| └ `due_date` | date | No |
| └ `payment_date` | date | No |
| └ `payment_method` | select | No |
| `quoted_amount` | currency | Yes | From original quote |
| `total_invoiced` | computed | - |
| `total_paid` | computed | - |
| `balance_due` | computed | - |

---

### Tab 9: P&L (Profit & Loss)

**Purpose:** Event profitability analysis

| Field | Type | Required |
|-------|------|----------|
| `revenue` | currency | Yes | Total invoiced |
| `total_costs` | currency | Yes | From Costs tab |
| `gross_profit` | computed | - | Revenue - Costs |
| `gross_margin` | computed | - | (Profit / Revenue) × 100 |
| `cost_breakdown` | object | - | By category |
| `comparison_to_quote` | computed | - | Actual vs Quoted |
| `notes` | textarea | No |

---

### Tab 10: NPS (Net Promoter Score)

**Purpose:** Customer satisfaction survey

| Field | Type | Required |
|-------|------|----------|
| `survey_sent` | boolean | No |
| `survey_sent_date` | date | No |
| `survey_completed` | boolean | No |
| `survey_completed_date` | date | No |
| `nps_score` | number | No | 0-10 scale |
| `nps_category` | computed | - | Detractor/Passive/Promoter |
| `feedback_questions` | array | No |
| └ `question` | text | - |
| └ `rating` | number | - | 1-5 scale |
| └ `comment` | text | - |
| `overall_feedback` | textarea | No |
| `testimonial` | textarea | No |
| `permission_to_share` | boolean | No |

---

## Status Flow

```
lead_won → planning → confirmed → in_progress → completed
                  ↓
              cancelled
```

---

## Links to Other Modules

| Source Field | Target Module | Relationship |
|--------------|---------------|--------------|
| `client_name` | CRM/Clients | Many-to-One |
| `lead_id` | Lead Generation | One-to-One |
| `event_coordinator` | Users | Many-to-One |
| `warehouse_allocations.item_id` | Logistics/Inventory | Many-to-Many |
| `invoices` | Financial/Invoices | One-to-Many |

---

## AssistBuild Configuration Commands

To configure this module via AssistBuild, use:

```
"Configura o módulo de projetos para catering com:
- 10 tabs: Ficha do Evento, Ementa, Materiais, Armazém, Alinhamento, Equipa, Custos, Faturação, P&L, NPS
- Tipos de evento: Casamento, Corporativo, Aniversário, Batizado/Comunhão, Natal, Almoço/Jantar
- Estados: planning, confirmed, in_progress, completed, cancelled
- Link para clientes e leads
- Cálculos automáticos de custos e margens"
```

---

## Event Types (from CSV import)

Based on imported leads:
- Casamento (Wedding)
- Corporativo (Corporate)
- Aniversário (Birthday/Anniversary)
- Batizado/Comunhão (Baptism/Communion)
- Natal (Christmas)
- Almoço/Jantar (Lunch/Dinner)
- Cocktail
- Lanche (Afternoon tea)

---

## Additional Suggestions for Catering

1. **Checklist de Montagem** - Pre-event setup verification
2. **Transporte/Logística** - Vehicle routing, loading schedules
3. **Briefing Document** - Printable team brief for event day
4. **Documentos/Fotos** - Attachments, photos, contracts
5. **Histórico de Comunicações** - Email/call logs with client
6. **Fornecedores do Evento** - Per-event supplier tracking
7. **Pós-Evento** - Post-event notes, lessons learned

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-25 | Initial specification from CSV analysis |
