# Python Sand Tracker

A real-time, multi-device sand monitoring app built for wellsite operations and sand coordinators.

---

## Firebase Setup: Enabling Anonymous Authentication

The application uses anonymous authentication to securely connect field devices to Cloud Firestore without requiring user login forms.

If you see a red warning banner at the top of the application stating:
> **"Can't reach the database — check that Anonymous sign-in is enabled in Firebase."**

Follow these quick steps to enable Anonymous sign-in in your Firebase Console:

### Step-by-Step Instructions

1. **Open Firebase Console**:
   Go to [https://console.firebase.google.com/](https://console.firebase.google.com/) and select your project (`gen-lang-client-0734566499` / `ai-studio-sandtracker-fa4ba5ca-6842-479d-96f0-f9bfd6c30a74`).

2. **Navigate to Authentication**:
   In the left sidebar menu, click **Build** > **Authentication**.

3. **Go to Sign-in Method Tab**:
   Click the **Sign-in method** tab at the top of the Authentication page.

4. **Enable Anonymous Provider**:
   - In the **Native providers** list, click on **Anonymous**.
   - Turn on the **Enable** toggle switch.
   - Click **Save**.

5. **Confirm It Is Enabled**:
   - On the **Sign-in method** page, verify that **Anonymous** is listed under **Sign-in providers** with status **Enabled** (green checkmark).
   - Refresh the Python Sand Tracker app. The red warning banner will disappear immediately and live real-time data syncing will be active.

---

## Core Features

- **Live Canister Level Tracking**: Real-time on-hand sand balances per silo and sand type.
- **Auto Draw Priority**: Automated pull order based on drawdown strategy (emptiest first, fill balance, etc.).
- **Manual Slot Overrides**: Force specific cans into designated run order slots.
- **Stage Shortfall & Reorder Alerts**: Immediate warnings when sand levels drop below stage needs or reorder thresholds.
