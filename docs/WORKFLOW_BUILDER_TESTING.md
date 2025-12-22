# Workflow Builder Testing Guide

## Quick Start Testing

### 1. Access the Workflow Builder

1. Start the dev server: `npm run dev`
2. Navigate to: `http://localhost:5000/workflows`
3. Click **"Create Workflow"** button
4. You'll be redirected to `/workflows/builder/new`

---

## Available Node Types

### 🟢 Triggers (Green)
- **Manual Trigger** - Start point for workflows

### 🔵 Actions (Blue)
- **CRUD Operation** - Database operations (Create/Read/Update/Delete)

### 🟣 Integrations (Purple)
- **HTTP Request** - Make API calls to external services

### 🟠 Conditions (Orange)
- **Condition** - Branch workflow based on logic

---

## Test Scenario 1: Simple Customer Creation

### Goal
Create a workflow that receives customer data and creates a customer record.

### Steps

1. **Add Manual Trigger Node**
   - Drag "Manual Trigger" from palette to canvas
   - Click the node to open properties panel
   - Set Label: "Receive Customer Data"

2. **Add CRUD Record Node**
   - Drag "CRUD Operation" to canvas
   - Click to configure:
     - Label: "Create Customer"
     - Operation: `create`
     - Module: `customers`
     - Fields (JSON):
     ```json
     {
       "name": "{{trigger.name}}",
       "email": "{{trigger.email}}"
     }
     ```

3. **Connect Nodes**
   - Click and drag from Manual Trigger's **right handle** (output)
   - Drop on CRUD Record's **left handle** (input)
   - You should see an animated line connecting them

4. **Save Workflow**
   - Click "Save" in top toolbar
   - Name: "Create Customer Workflow"

---

## Test Scenario 2: API Integration with Condition

### Goal
Fetch data from external API and conditionally create records.

### Steps

1. **Manual Trigger**
   - Label: "Start API Fetch"

2. **HTTP Request Node**
   - Drag "HTTP Request" to canvas
   - Configure:
     - Label: "Fetch User Data"
     - Method: `GET`
     - URL: `https://jsonplaceholder.typicode.com/users/1`
     - Headers: `{}`

3. **Condition Node**
   - Drag "Condition" to canvas
   - Configure:
     - Label: "Check Email Exists"
     - Field: `{{http_request.email}}`
     - Operator: `isNotEmpty`

4. **CRUD Record Node**
   - Label: "Create User Record"
   - Operation: `create`
   - Module: `users`
   - Fields:
   ```json
   {
     "name": "{{http_request.name}}",
     "email": "{{http_request.email}}",
     "username": "{{http_request.username}}"
   }
   ```

5. **Connect All Nodes**
   - Manual Trigger → HTTP Request
   - HTTP Request → Condition
   - Condition → CRUD Record

---

## Test Scenario 3: Multi-Step Data Processing

### Goal
Create customer, then create related order.

### Steps

1. **Manual Trigger**
   - Label: "New Order Request"

2. **First CRUD Node**
   - Label: "Create Customer"
   - Operation: `create`
   - Module: `customers`
   - Fields:
   ```json
   {
     "name": "{{trigger.customerName}}",
     "email": "{{trigger.customerEmail}}"
   }
   ```

3. **Second CRUD Node**
   - Label: "Create Order"
   - Operation: `create`
   - Module: `orders`
   - Fields:
   ```json
   {
     "customerId": "{{crud_record_1.id}}",
     "total": "{{trigger.orderTotal}}",
     "status": "pending"
   }
   ```

4. **Connect Sequentially**
   - Manual Trigger → Create Customer → Create Order

---

## Testing Features

### ✅ What to Test

#### Node Palette
- [ ] All 4 node types visible in palette
- [ ] Categories properly organized (Triggers, Actions, Integrations, Conditions)
- [ ] Drag and drop works smoothly
- [ ] Node preview shows on hover

#### Canvas Operations
- [ ] Zoom in/out with mouse wheel
- [ ] Pan by dragging canvas
- [ ] Minimap shows workflow overview
- [ ] Background grid is visible

#### Node Operations
- [ ] Click node to select (border turns blue)
- [ ] Sheet panel opens on right with node config
- [ ] Duplicate node works
- [ ] Delete node removes it and its connections
- [ ] Drag node to reposition

#### Connections
- [ ] Drag from output handle (right side)
- [ ] Drop on input handle (left side)
- [ ] Connection shows animated line
- [ ] Multiple connections from one output work
- [ ] Delete edge by selecting and pressing Delete key

#### Configuration
- [ ] All fields update in real-time
- [ ] JSON fields validate properly
- [ ] Dropdowns show all options
- [ ] Template variables can be typed

#### Workflow-Level
- [ ] Workflow name editable in header
- [ ] Save button (currently logs to console)
- [ ] Execute button (currently shows toast)
- [ ] Back button returns to workflows list

---

## Visual Testing Checklist

### Layout
- [ ] Left sidebar: Node palette (fixed width ~288px)
- [ ] Center: Canvas (full height, responsive)
- [ ] Right: Properties sheet (slides in when node selected)
- [ ] Top: Header with back, name, save, execute

### Colors
- [ ] Green nodes: Triggers
- [ ] Blue nodes: Actions
- [ ] Purple nodes: Integrations
- [ ] Orange nodes: Conditions
- [ ] Selected node: Blue border with ring
- [ ] Error node: Red border with ring

### Interactions
- [ ] Smooth transitions on hover
- [ ] Cursor changes to grab when dragging
- [ ] Node shadows on hover
- [ ] Sheet animation smooth

---

## Known Limitations (Current Phase)

1. **Save doesn't persist** - Currently logs to console
2. **Execute doesn't run** - Shows toast notification only
3. **No validation feedback** - Errors not displayed yet
4. **No execution history** - Will be Phase 4
5. **No undo/redo** - Planned for Phase 3

---

## Quick Debug Tips

### If nodes don't appear
```javascript
// Check browser console for errors
// Verify registerNodes.ts imports are correct
```

### If drag-drop fails
```javascript
// Clear browser cache
// Check onDrop handler in workflow-builder.tsx
```

### If properties panel won't open
```javascript
// Check selectedNodeId in store
// Verify Sheet component is rendering
```

---

## Testing with Browser DevTools

### React DevTools
1. Install React DevTools extension
2. Open Components tab
3. Find `WorkflowBuilderPage`
4. Inspect `useWorkflowStore` hook state
5. Check nodes/edges arrays

### Console Testing
```javascript
// Access store directly
const store = window.__WORKFLOW_STORE__

// Add node programmatically
store.getState().addNode({
  id: 'test-1',
  type: 'manual_trigger',
  position: { x: 100, y: 100 },
  data: { label: 'Test Node', config: {} }
})
```

---

## Next Steps After Testing

1. **Phase 2 Complete** ✅
   - Node palette ✅
   - Properties panel ✅
   - 4 node types ✅

2. **Phase 3: Advanced Features**
   - Auto-layout algorithm
   - Undo/redo
   - Copy/paste
   - Import/export JSON

3. **Phase 4: Execution**
   - Connect to backend API
   - Real-time execution status
   - Error highlighting
   - Execution history viewer

---

## Example Workflow JSON

After building a workflow, here's what the serialized format looks like:

```json
{
  "name": "Customer Order Workflow",
  "description": "Create customer and order",
  "definition": {
    "nodes": [
      {
        "id": "manual_trigger-1",
        "type": "manual_trigger",
        "position": { "x": 100, "y": 100 },
        "data": {
          "label": "Start",
          "config": { "label": "Start" }
        }
      },
      {
        "id": "crud_record-1",
        "type": "crud_record",
        "position": { "x": 400, "y": 100 },
        "data": {
          "label": "Create Customer",
          "config": {
            "operation": "create",
            "module": "customers",
            "fields": {
              "name": "{{trigger.name}}",
              "email": "{{trigger.email}}"
            }
          }
        }
      }
    ],
    "edges": [
      {
        "id": "e-manual_trigger-1-crud_record-1",
        "source": "manual_trigger-1",
        "target": "crud_record-1"
      }
    ]
  }
}
```

This can be saved and loaded back into the workflow builder!
