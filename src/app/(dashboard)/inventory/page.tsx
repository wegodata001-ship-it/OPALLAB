"use client";

import { useState, useRef } from "react";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ExportActions } from "@/components/shared/export-actions";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { useApp } from "@/providers/AppProvider";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { filterByDateRange } from "@/lib/date-filter";
import type { InventoryItem, DateRange } from "@/lib/types";
import { AlertTriangle, Plus, Package, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export default function InventoryPage() {
  const {
    inventory, inventoryCategories, getInventoryByType, getCategoryLabel,
    updateInventoryItem, addInventoryItem, addInventoryMovement, addInventoryCategory,
    getMovementsByItem, users, currentUser,
  } = useApp();

  const [tab, setTab] = useState<string>("ALL");
  const [showAdd, setShowAdd] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const [newCat, setNewCat] = useState({ name: "", color: "#10b981" });
  const [stockIn, setStockIn] = useState({ qty: "", cost: "", notes: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [newItem, setNewItem] = useState({
    name: "", barcode: "", purchaseCost: "", quantity: "", type: inventoryCategories[0]?.id ?? "RAW_MATERIALS",
    location: "", description: "",
  });

  const canSeeOwner = currentUser?.role === "OWNER" || currentUser?.role === "ADMIN";
  const visibleCategories = inventoryCategories.filter((c) => c.id !== "OWNER_ASSETS" || canSeeOwner);

  const items = tab === "ALL"
    ? inventory.filter((i) => i.isActive && (canSeeOwner || i.inventoryType !== "OWNER_ASSETS"))
    : getInventoryByType(tab);

  const totalValue = items.reduce((s, i) => s + i.purchaseCost * i.quantity, 0);

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleAdd = async () => {
    if (!newItem.name || !newItem.barcode) return;
    await addInventoryItem({
      inventoryType: newItem.type, name: newItem.name, barcode: newItem.barcode,
      purchaseCost: parseFloat(newItem.purchaseCost) || 0, quantity: parseInt(newItem.quantity) || 0,
      minQuantity: 5, unit: "יחידה", location: newItem.location || null,
      description: newItem.description || null, imageUrl: null, isActive: true,
    }, parseFloat(newItem.purchaseCost) || 0, imageFile ?? undefined);
    setShowAdd(false);
    setImageFile(null);
    setImagePreview(null);
    setNewItem({ name: "", barcode: "", purchaseCost: "", quantity: "", type: visibleCategories[0]?.id ?? "RAW_MATERIALS", location: "", description: "" });
  };

  const handleStockIn = () => {
    if (!selectedItem || !stockIn.qty) return;
    addInventoryMovement({
      itemId: selectedItem.id, quantity: parseInt(stockIn.qty), type: "IN",
      unitCost: parseFloat(stockIn.cost) || selectedItem.purchaseCost,
      notes: stockIn.notes || "הוספת מלאי", performedBy: currentUser?.id ?? "system",
    });
    setStockIn({ qty: "", cost: "", notes: "" });
    setSelectedItem((prev) => prev ? { ...prev, quantity: prev.quantity + parseInt(stockIn.qty) } : null);
  };

  const movements = selectedItem
    ? filterByDateRange(getMovementsByItem(selectedItem.id), (m) => m.createdAt, dateRange)
    : [];

  return (
    <>
      <Header title="מלאי" description="ניהול מלאי, תמונות ותנועות"
        actions={<ExportActions title="מלאי" whatsappText={`מלאי OPAL LAB\n${items.length} פריטים\nשווי: ${formatCurrency(totalValue)}`} pdfHtml={`<h2>מלאי</h2>`} />} />

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setTab("ALL")} className={cn("px-4 py-2 rounded-xl text-sm font-medium", tab === "ALL" ? "bg-opal-gold text-white" : "bg-white border")}>הכל</button>
        {visibleCategories.map((c) => (
          <button key={c.id} onClick={() => setTab(c.id)} className={cn("px-4 py-2 rounded-xl text-sm font-medium border", tab === c.id ? "text-white" : "bg-white")} style={tab === c.id ? { backgroundColor: c.color } : {}}>
            {c.name}
          </button>
        ))}
        <button onClick={() => setShowNewCategory(true)} className="px-3 py-2 rounded-xl text-sm border border-dashed text-slate-500 hover:border-opal-gold">+ מלאי חדש</button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold">{items.length}</p><p className="text-xs text-slate-500">פריטים</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-opal-gold-dark">{formatCurrency(totalValue)}</p><p className="text-xs text-slate-500">שווי</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-amber-600">{items.filter((i) => i.quantity <= i.minQuantity).length}</p><p className="text-xs text-slate-500">מלאי נמוך</p></CardContent></Card>
      </div>

      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" />פריט חדש</Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item) => {
          const cat = inventoryCategories.find((c) => c.id === item.inventoryType);
          const low = item.quantity <= item.minQuantity;
          return (
            <Card key={item.id} className={cn("cursor-pointer hover:shadow-md transition-all", low && "border-amber-200")} onClick={() => setSelectedItem(item)}>
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <div className="h-16 w-16 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                    {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : <Package className="h-6 w-6 text-slate-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between">
                      <p className="font-semibold text-sm truncate">{item.name}</p>
                      {low && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: cat?.color ?? "#94a3b8" }}>{getCategoryLabel(item.inventoryType)}</span>
                    <p className="text-2xl font-bold mt-1">{item.quantity}</p>
                    <p className="text-xs text-slate-400">{formatCurrency(item.purchaseCost)}/יח׳ · {formatCurrency(item.purchaseCost * item.quantity)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add item modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="פריט חדש">
        <div className="space-y-4">
          <div><Label>סוג מלאי *</Label>
            <Select value={newItem.type} onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}>
              {visibleCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>שם *</Label><Input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} /></div>
            <div><Label>ברקוד *</Label><Input value={newItem.barcode} onChange={(e) => setNewItem({ ...newItem, barcode: e.target.value })} /></div>
            <div><Label>עלות רכישה</Label><Input type="number" value={newItem.purchaseCost} onChange={(e) => setNewItem({ ...newItem, purchaseCost: e.target.value })} /></div>
            <div><Label>כמות</Label><Input type="number" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })} /></div>
            <div><Label>מיקום</Label><Input value={newItem.location} onChange={(e) => setNewItem({ ...newItem, location: e.target.value })} /></div>
            <div><Label>תיאור</Label><Input value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} /></div>
          </div>
          <div>
            <Label>תמונת מוצר</Label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
            <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 mt-1 px-4 py-2 border rounded-lg text-sm hover:bg-slate-50">
              <ImageIcon className="h-4 w-4" />{imagePreview ? "תמונה נבחרה ✓" : "העלאת תמונה"}
            </button>
            {imagePreview && <img src={imagePreview} alt="" className="mt-2 h-24 rounded-lg object-cover" />}
          </div>
          <Button onClick={handleAdd} className="w-full">שמירה</Button>
        </div>
      </Modal>

      {/* New category modal */}
      <Modal open={showNewCategory} onClose={() => setShowNewCategory(false)} title="הוספת סוג מלאי חדש">
        <div className="space-y-3">
          <div><Label>שם</Label><Input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="לדוגמה: כלים חד פעמיים" /></div>
          <div><Label>צבע</Label><input type="color" value={newCat.color} onChange={(e) => setNewCat({ ...newCat, color: e.target.value })} className="h-10 w-full" /></div>
          <Button onClick={() => { if (newCat.name) { addInventoryCategory(newCat.name, newCat.color); setShowNewCategory(false); setNewCat({ name: "", color: "#10b981" }); } }} className="w-full">הוספה</Button>
        </div>
      </Modal>

      {/* Item detail + movements */}
      <Modal open={!!selectedItem} onClose={() => setSelectedItem(null)} title={selectedItem?.name ?? ""} className="max-w-3xl">
        {selectedItem && (
          <div className="space-y-4">
            <div className="flex gap-4">
              {selectedItem.imageUrl && <img src={selectedItem.imageUrl} alt="" className="h-24 w-24 rounded-xl object-cover" />}
              <div className="text-sm space-y-1">
                <p><span className="text-slate-500">ברקוד:</span> {selectedItem.barcode}</p>
                <p><span className="text-slate-500">כמות:</span> <strong>{selectedItem.quantity}</strong></p>
                <p><span className="text-slate-500">עלות נוכחית:</span> {formatCurrency(selectedItem.purchaseCost)}</p>
                <p><span className="text-slate-500">שווי:</span> {formatCurrency(selectedItem.purchaseCost * selectedItem.quantity)}</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border">
              <p className="text-sm font-medium mb-2">הוספת מלאי (מחיר רכישה משתנה)</p>
              <div className="grid grid-cols-3 gap-2">
                <Input type="number" placeholder="כמות" value={stockIn.qty} onChange={(e) => setStockIn({ ...stockIn, qty: e.target.value })} />
                <Input type="number" placeholder="מחיר יחידה ₪" value={stockIn.cost} onChange={(e) => setStockIn({ ...stockIn, cost: e.target.value })} />
                <Input placeholder="הערות" value={stockIn.notes} onChange={(e) => setStockIn({ ...stockIn, notes: e.target.value })} />
              </div>
              <Button size="sm" className="mt-2" onClick={handleStockIn}>רישום כניסה</Button>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="font-medium">היסטוריית תנועות</p>
                <DateRangeFilter value={dateRange} onChange={setDateRange} />
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {movements.map((m) => (
                  <div key={m.id} className="flex justify-between p-2 rounded-lg bg-slate-50 text-sm">
                    <div>
                      <span className={cn("font-bold", m.quantity > 0 ? "text-emerald-600" : "text-red-600")}>
                        {m.quantity > 0 ? "+" : ""}{m.quantity}
                      </span>
                      <span className="text-slate-500 mr-2">@ {formatCurrency(m.unitCost)}</span>
                      {m.orderRef && <span className="text-xs text-opal-gold-dark"> · {m.orderRef}</span>}
                      {m.notes && <p className="text-xs text-slate-400">{m.notes}</p>}
                    </div>
                    <div className="text-left text-xs text-slate-400">
                      <p>{formatDateTime(m.createdAt)}</p>
                      <p>{users.find((u) => u.id === m.performedBy)?.name}</p>
                    </div>
                  </div>
                ))}
                {movements.length === 0 && <p className="text-center text-slate-400 py-4">אין תנועות</p>}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
