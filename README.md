# 🌳 SharePoint Org Chart — Modern Tree View

[![Latest Release](https://img.shields.io/github/v/release/alessandro-Petrone/struttura-aziendale?style=for-the-badge)](https://github.com/alessandro-Petrone/struttura-aziendale/releases/latest)
[![License](https://img.shields.io/github/license/alessandro-Petrone/struttura-aziendale?style=for-the-badge&cacheSeconds=60)](LICENSE)
[![Donate](https://img.shields.io/badge/Donate-PayPal-blue?style=for-the-badge)](https://www.paypal.com/donate/?hosted_button_id=C3KYQ7FB9PRKQ)
![SPFx Version](https://img.shields.io/badge/SPFx-1.22.2-green?style=for-the-badge)

A modern, dynamic, and fully interactive organizational chart for **SharePoint Online**, powered by **SPFx** and **Microsoft Graph**.  
Ideal for HR portals, corporate intranets, employee directories, and managerial dashboards.

---

## 🔍 Overview

**Struttura Aziendale – Modern Tree View** provides a beautiful hierarchical visualization of your company structure, supporting multiple layouts, filters, and interactive profile cards. It’s optimized for performance and mobile.

**Use cases**
- HR department directory
- Team & department overviews
- Org navigation and discovery
- Leadership & reporting lines

---

## ✨ Features

### 🌲 Modern Tree Layout
- Perfect alignment for hierarchy nodes
- Smooth connecting lines/curves
- Auto‑expand/collapse children
- Focus/center on selected node

### 📊 Dynamic Grid View
- Toggle between Tree and compact Grid
- Ideal for large organizations

### 🔎 Advanced Search
- Search by **Name**, **Email**, **Job Title**
- Fast highlight and scroll-to-card

### 🧭 Smart Filtering
- Tabs by **Department**
- Filter by **Office/Location**
- Alphabetical (A–Z) listing

### 🧑‍💼 Interactive Profile Cards
- Title, Department, Email link
- Microsoft Teams deep-link
- Hover details and quick actions

### 📱 Fully Responsive
- Mobile-friendly layout
- Centered tree scaling
- Smart grid wrapping

---

## 🖼️ Screenshots / Demo

> Sostituisci i placeholder con le tue immagini e (se vuoi) una GIF.

| Tree View | Grid View |
|---|---|
| ![Tree View](docs/images/tree-view.png) | ![Grid View](docs/images/grid-view.png) |

**Demo GIF**  
![Demo](docs/images/demo.gif)

---

## 📦 Installation

### ✅ Prerequisites
- Microsoft 365 Tenant  
- SharePoint Online  
- **SPFx 1.22+**  
- API Permissions (via Microsoft Graph):
  - `User.Read.All`
  - `User.ReadBasic.All`

> Questi permessi vengono approvati tramite **SharePoint Admin Center → API Access** dopo il deploy dell’app.

### 🚀 Minimal Path to Awesome

```bash
git clone https://github.com/alessandro-Petrone/struttura-aziendale.git
cd struttura-aziendale

npm install
npx heft build
npx heft package-solution --production
