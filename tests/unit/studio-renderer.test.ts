import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import Studio from "../../src/components/brand/models/studio.js";
afterEach(() => vi.unstubAllGlobals());

it.each([false, true])(
  "initializes a renderer with safe upload flags on a reused canvas (dirty=%s)",
  (dirty) => {
    vi.stubGlobal("devicePixelRatio", 2);
    const flags = new Map<number, boolean>([
      [37440, dirty],
      [37441, dirty],
    ]);
    const context = {
      UNPACK_FLIP_Y_WEBGL: 37440,
      UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37441,
      pixelStorei: (key: number, value: boolean) => flags.set(key, value),
    };
    const canvas = { getContext: vi.fn(() => context) };
    const built = {
      setPixelRatio: vi.fn(),
      setClearColor: vi.fn(),
      shadowMap: {},
    };
    class Renderer {
      constructor(options: { context: unknown }) {
        // Three initializes 3D placeholders in the constructor, before its first
        // render. Check the upload preconditions at that exact boundary.
        expect(options.context).toBe(context);
        if (flags.get(37440) || flags.get(37441))
          throw new Error("INVALID_OPERATION: illegal 3D texture upload flags");
        return built;
      }
    }
    const result = Studio.renderer(
      { ...THREE, WebGLRenderer: Renderer },
      canvas,
      true,
      {},
    );
    expect(result).toBe(built);
    expect(canvas.getContext).toHaveBeenCalledWith(
      "webgl2",
      expect.objectContaining({
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
      }),
    );
  },
);

it("allows the existing static fallback when WebGL2 is unavailable", () => {
  const Renderer = vi.fn();
  expect(() =>
    Studio.renderer(
      { WebGLRenderer: Renderer },
      { getContext: () => null },
      true,
      {},
    ),
  ).toThrow("WebGL2 is unavailable");
  expect(Renderer).not.toHaveBeenCalled();
});

it("bakes studio lighting without exceeding Three r170's blur sample budget", () => {
  const fromScene = vi.fn((_scene: THREE.Scene, sigma: number) => {
    const requiredSamples = 1 + Math.floor((3 * sigma) / (Math.PI / (2 * 255)));
    expect(requiredSamples).toBeLessThanOrEqual(20);
    return { texture: new THREE.Texture() };
  });
  class PMREMGenerator {
    fromScene = fromScene;
    dispose = vi.fn();
  }
  const texture = Studio.environment({ ...THREE, PMREMGenerator }, {}, {});
  expect(fromScene).toHaveBeenCalledOnce();
  expect(texture.userData.riwayRenderTarget.texture).toBe(texture);
  texture.dispose();
});
