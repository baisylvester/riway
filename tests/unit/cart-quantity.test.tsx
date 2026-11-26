import {
  Children,
  isValidElement,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the actual component event handlers without adding a DOM package.
// Hook state survives explicit rerenders, and dependency effects are flushed.
const hooks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as { value?: unknown; dependencies?: readonly unknown[] }[],
  effects: [] as (() => void)[],
}));
const store = vi.hoisted(() => ({
  items: [{ productId: "77000000-0000-4000-8000-000000000001", quantity: 3 }],
  ready: true,
  update: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useId: () => "quantity-error-fixture",
  // This handler-only harness fixes locale; real provider/rendering is covered
  // by locale SSR and browser tests.
  useContext: () => ({ locale: "en", available: ["en"] }),
  useRef: (initial: unknown) => {
    const slot = (hooks.slots[hooks.cursor++] ??= {
      value: { current: initial },
    });
    return slot.value;
  },
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    const slot = (hooks.slots[index] ??= {
      value: typeof initial === "function" ? initial() : initial,
    });
    return [
      slot.value,
      (next: unknown) => {
        slot.value = typeof next === "function" ? next(slot.value) : next;
      },
    ];
  },
  useEffect: (effect: () => void, dependencies: readonly unknown[]) => {
    const slot = (hooks.slots[hooks.cursor++] ??= {});
    if (
      !slot.dependencies ||
      dependencies.some(
        (value, index) => !Object.is(value, slot.dependencies![index]),
      )
    ) {
      slot.dependencies = dependencies;
      hooks.effects.push(effect);
    }
  },
}));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("next/image", () => ({ default: "img" }));
vi.mock("../../src/components/store-provider", () => ({
  useStore: () => store,
}));

import { CartQuantity } from "../../src/components/cart-quantity";
import { Cart } from "../../src/components/cart";

type Element = ReactElement<Record<string, unknown>>;
function find(
  node: ReactNode,
  predicate: (element: Element) => boolean,
): Element | undefined {
  if (!isValidElement(node)) return;
  const element = node as Element;
  if (predicate(element)) return element;
  for (const child of Children.toArray(element.props.children as ReactNode)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement(node)) return "";
  return Children.toArray((node as Element).props.children as ReactNode)
    .map(text)
    .join("");
}

type Props = Parameters<typeof CartQuantity>[0];
type Input = {
  value: string;
  max: number;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
};
let props: Props;
let tree: ReactNode;
function render(patch: Partial<Props> = {}) {
  props = { ...props, ...patch };
  do {
    hooks.cursor = 0;
    tree = CartQuantity(props);
    const effects = hooks.effects.splice(0);
    if (!effects.length) break;
    effects.forEach((effect) => effect());
  } while (true);
  return tree;
}
function input() {
  return find(tree, (element) => element.type === "input")!
    .props as unknown as Input;
}
function change(value: string) {
  input().onChange({
    currentTarget: { value },
  } as ChangeEvent<HTMLInputElement>);
  render();
}
function blur() {
  input().onBlur();
  render();
}

beforeEach(() => {
  hooks.cursor = 0;
  hooks.slots = [];
  hooks.effects = [];
  vi.clearAllMocks();
  store.items = [
    { productId: "77000000-0000-4000-8000-000000000001", quantity: 3 },
  ];
  props = {
    productName: "Fixture product",
    quantity: 3,
    maximum: 24,
    onCommit: vi.fn((quantity) => {
      props = { ...props, quantity };
    }),
    onRemove: vi.fn(),
  };
  render();
});
afterEach(() => vi.unstubAllGlobals());

describe("cart quantity editing", () => {
  it("allows clearing and typing a replacement without deleting the bag line", () => {
    change("");
    expect(input().value).toBe("");
    expect(props.quantity).toBe(3);
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(props.onRemove).not.toHaveBeenCalled();
    change("12");
    expect(input().value).toBe("12");
    expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(12);
    blur();
    expect(props.quantity).toBe(12);
    expect(props.onRemove).not.toHaveBeenCalled();
  });

  it("restores a blank field on blur without changing the saved quantity", () => {
    change("");
    blur();
    expect(input().value).toBe("3");
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(props.onRemove).not.toHaveBeenCalled();
    expect(text(tree)).toContain("Your previous quantity was kept.");
  });

  it("rejects zero, negative, fractional and excessive edits with linked feedback", () => {
    for (const value of ["0", "-1", "1.5", "25"]) {
      change(value);
      expect(input()["aria-invalid"]).toBe(true);
      const status = find(tree, (element) => element.props.role === "status")!;
      expect(input()["aria-describedby"]).toBe(status.props.id);
      expect(status.props.style).toEqual({ gridColumn: "1 / -1", margin: 0 });
      blur();
      expect(input().value).toBe("3");
      expect(text(tree)).toContain("Enter a whole quantity from 1 to 24.");
    }
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(props.onRemove).not.toHaveBeenCalled();
  });

  it("enforces the current offer maximum for typed values", () => {
    render({ maximum: 6 });
    change("7");
    expect(input().max).toBe(6);
    expect(input()["aria-invalid"]).toBe(true);
    expect(props.onCommit).not.toHaveBeenCalled();
    blur();
    expect(input().value).toBe("3");
    expect(text(tree)).toContain("1 to 6");
    change("6");
    expect(props.quantity).toBe(6);
    expect(input()["aria-invalid"]).toBeUndefined();
  });

  it("preserves existing bag values on a lower market maximum and asks for correction", () => {
    render({ quantity: 12 });
    render({ maximum: 6 });
    expect(input().value).toBe("12");
    expect(input()["aria-invalid"]).toBe(true);
    expect(text(tree)).toContain(
      "Your saved quantity exceeds this market's maximum of 6",
    );
    expect(props.onCommit).not.toHaveBeenCalled();
    render({ maximum: 24 });
    expect(input().value).toBe("12");
    expect(input()["aria-invalid"]).toBeUndefined();
    expect(
      find(tree, (element) => element.props.role === "status"),
    ).toBeUndefined();
  });

  it("synchronizes an account-restored quantity without committing a draft", () => {
    change("");
    render({ quantity: 19 });
    expect(input().value).toBe("19");
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it("validates Enter and keeps deletion an explicit action", () => {
    change("0");
    const preventDefault = vi.fn();
    input().onKeyDown({
      key: "Enter",
      preventDefault,
    } as unknown as KeyboardEvent<HTMLInputElement>);
    render();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(input().value).toBe("3");
    expect(props.onRemove).not.toHaveBeenCalled();
    const button = find(
      tree,
      (element) => element.props["aria-label"] === "Remove Fixture product",
    )!;
    (button.props.onClick as () => void)();
    expect(props.onRemove).toHaveBeenCalledOnce();
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it("keeps Cart wiring for the offer limit, saved values and explicit remove", () => {
    hooks.cursor = 0;
    hooks.slots = [];
    const id = store.items[0].productId;
    const cart = Cart({
      products: [
        {
          id,
          slug: "fixture",
          name: "Fixture",
          category: "Nutrition",
          subtitle: "",
          description: "",
          image_url: null,
          status: "published",
        },
      ],
      offers: [
        {
          product_id: id,
          market: "PH",
          currency: "PHP",
          retail_minor: null,
          member_minor: null,
          regulatory_approved: false,
          approval_reference: null,
          max_quantity: 6,
        },
      ],
      market: "PH",
    });
    const editor = find(cart, (element) => element.type === CartQuantity)!
      .props as unknown as Props;
    expect(editor.quantity).toBe(3);
    expect(editor.maximum).toBe(6);
    editor.onCommit(4);
    editor.onRemove();
    expect(store.update.mock.calls).toEqual([
      [id, 4],
      [id, 0],
    ]);
  });
});

describe("account bag actions", () => {
  function renderCart(initial = false) {
    if (initial) hooks.slots = [];
    hooks.cursor = 0;
    tree = Cart({ products: [], offers: [], market: "PH" });
  }
  function button(name: string) {
    return find(
      tree,
      (element) => element.type === "button" && text(element) === name,
    )!.props as { onClick: () => Promise<void>; disabled: boolean };
  }

  it("explicitly saves an empty account bag through the existing PUT contract", async () => {
    store.items = [];
    const request = vi.fn().mockResolvedValue(Response.json({ saved: true }));
    vi.stubGlobal("fetch", request);
    renderCart(true);
    await button("Save empty bag to account").onClick();
    renderCart();
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/cart", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "[]",
    });
    expect(text(tree)).toContain("Your empty bag was saved to your account.");
    expect(store.restore).not.toHaveBeenCalled();
    expect(store.items).toEqual([]);
  });

  it("retains the normal save label and selection payload", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ saved: true }));
    vi.stubGlobal("fetch", request);
    renderCart(true);
    await button("Save bag to account").onClick();
    renderCart();
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual(store.items);
    expect(text(tree)).toContain("Your bag was saved to your account.");
    expect(text(tree)).not.toContain("Save empty bag to account");
  });

  it("shows rejected empty-save feedback without clearing account or local data", async () => {
    store.items = [];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { message: "Sign in to save your bag." } },
            { status: 401 },
          ),
        ),
    );
    renderCart(true);
    await button("Save empty bag to account").onClick();
    renderCart();
    expect(text(tree)).toContain("Sign in to save your bag.");
    expect(button("Save empty bag to account").disabled).toBe(false);
    expect(store.restore).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });

  it("recovers from a failed request and allows an explicit retry", async () => {
    store.items = [];
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline fixture"))
      .mockResolvedValueOnce(Response.json({ saved: true }));
    vi.stubGlobal("fetch", request);
    renderCart(true);
    await button("Save empty bag to account").onClick();
    renderCart();
    expect(text(tree)).toContain("Your bag could not be saved. Try again.");
    expect(button("Restore account bag").disabled).toBe(false);
    await button("Save empty bag to account").onClick();
    renderCart();
    expect(request).toHaveBeenCalledTimes(2);
    expect(text(tree)).toContain("Your empty bag was saved to your account.");
  });

  it("prevents pending duplicate saves and overlapping restores", async () => {
    store.items = [];
    let complete!: (response: Response) => void;
    const request = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
    );
    vi.stubGlobal("fetch", request);
    renderCart(true);
    const pending = button("Save empty bag to account").onClick();
    renderCart();
    expect(button("Save empty bag to account").disabled).toBe(true);
    expect(button("Restore account bag").disabled).toBe(true);
    await button("Save empty bag to account").onClick();
    await button("Restore account bag").onClick();
    expect(request).toHaveBeenCalledTimes(1);
    complete(Response.json({ saved: true }));
    await pending;
    renderCart();
    expect(button("Save empty bag to account").disabled).toBe(false);
    expect(button("Restore account bag").disabled).toBe(false);
  });
});
