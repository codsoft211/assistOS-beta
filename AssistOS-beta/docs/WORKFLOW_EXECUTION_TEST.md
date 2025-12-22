# Quick Test: Execute Workflow with Visual Feedback

## Setup a Test Workflow

### 1. Create Workflow
1. Go to: `http://localhost:5000/workflows`
2. Click **"Create Workflow"**

### 2. Build Simple Workflow

**Add Manual Trigger:**
- Drag "Manual Trigger" to canvas
- Position: top-left
- Click to configure:
  - Label: "Start Customer Creation"

**Add CRUD Node:**
- Drag "CRUD Operation" to canvas
- Position: to the right of trigger
- Click to configure:
  - Label: "Create Customer"
  - Operation: `create`
  - Module: `customers`
  - Fields (copy this JSON):
  ```json
  {
    "name": "{{trigger.name}}",
    "email": "{{trigger.email}}"
  }
  ```

**Connect Them:**
- Drag from Manual Trigger's **right handle** → CRUD node's **left handle**
- You'll see an animated connecting line

### 3. Execute and Watch!

Click the **"Execute"** button in the top-right toolbar.

## What You'll See:

### Real-Time Visual Feedback:

1. **Initial State**
   - All nodes: White background, no status

2. **After clicking Execute**
   - Toast: "Executing workflow..."

3. **Manual Trigger Node**
   - Header shows: **spinning loader icon** ⏳
   - Text below: "Executing..."
   - Node turns blue-tinted

4. **CRUD Record Node** (when trigger completes)
   - Header shows: **spinning loader icon** ⏳
   - Text below: "Executing..."
   - Node turns blue-tinted

5. **Success State**
   - Both nodes show: **green checkmark** ✓
   - Text: "✓ Completed"
   - Toast: "Workflow completed successfully!"

6. **If Error Occurs**
   - Failed node shows: **red X icon** ✗
   - Red error text displayed in node
   - Toast: "Workflow execution failed"

## Visual States Summary:

| Status | Header Icon | Text | Border |
|--------|-------------|------|--------|
| Idle | None | - | Gray |
| Running | 🔄 Spinning | "Executing..." | Blue |
| Completed | ✅ Checkmark | "✓ Completed" | Gray |
| Failed | ❌ X | Error message | Red |

## How It Works:

1. **Execute Button** → Calls `/api/assistbuild/workflows/execute`
2. **Backend** → Starts workflow execution, returns `executionId`
3. **Frontend** → Polls `/api/assistbuild/executions/{id}` every 1 second
4. **Updates Flow** → As each node completes, UI updates in real-time
5. **Shows Status** → Icons + text appear on each node

## Test Data Being Sent:

When you click Execute, it sends:
```json
{
  "workflow": {
    "nodes": [...],
    "edges": [...]
  },
  "environment": "sandbox",
  "triggerData": {
    "name": "Test User",
    "email": "test@example.com"
  }
}
```

## Expected Backend Behavior:

1. Manual Trigger executes → Passes `triggerData` forward
2. CRUD node receives data → Creates customer with:
   - name: "Test User"
   - email: "test@example.com"
3. Returns success with created customer ID

## Troubleshooting:

### Nodes Don't Update
- Check browser console for errors
- Verify backend is running
- Check network tab for API calls

### Execution Hangs
- Backend may have errors
- Check worker logs: `npm run worker`
- Verify Redis is running

### Wrong Data
- Ensure template variables use correct syntax: `{{trigger.fieldName}}`
- Check field mapping in CRUD node configuration

## Next Steps:

Try these variations:
1. Add multiple CRUD nodes in sequence
2. Test with different modules (orders, products)
3. Try read/update/delete operations
4. Build complex workflows with branching

The visual feedback makes debugging workflows super easy - you can see exactly where execution stops or fails!
