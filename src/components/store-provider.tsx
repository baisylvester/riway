"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { cartSchema, mergeCart, type CartItem } from "@/lib/domain";
interface Store {
  items: CartItem[];
  ready: boolean;
  add: (id: string) => void;
  update: (id: string, quantity: number) => void;
  clear: () => void;
  restore: (items: CartItem[]) => void;
}
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]),
    [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const p = cartSchema.safeParse(
        JSON.parse(localStorage.getItem("riway-cart") || "[]"),
      );
      if (p.success) setItems(p.data);
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem("riway-cart", JSON.stringify(items));
  }, [items, ready]);
  return (
    <Context.Provider
      value={{
        items,
        ready,
        add(id) {
          setItems((v) => mergeCart(v, id));
        },
        update(id, q) {
          if (!Number.isInteger(q) || q < 0 || q > 24) return;
          setItems((v) =>
            q === 0
              ? v.filter((i) => i.productId !== id)
              : v.map((i) => (i.productId === id ? { ...i, quantity: q } : i)),
          );
        },
        clear() {
          setItems([]);
        },
        restore(value) {
          setItems(cartSchema.parse(value));
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const v = useContext(Context);
  if (!v) throw Error("Store provider missing");
  return v;
}
