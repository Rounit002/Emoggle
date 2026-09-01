"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

type MeshConnection = { start: number; end: number } | [number, number];

interface MediaPipeFaceContextValue {
  landmarker: any | null;
  contourConnections: MeshConnection[];
  status: "idle" | "loading" | "ready" | "error";
}

const WASM_URL = "/mediapipe/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

const FALLBACK_CONTOUR_CONNECTIONS: MeshConnection[] = [
  [10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389], [389, 356], [356, 454],
  [454, 323], [323, 361], [361, 288], [288, 397], [397, 365], [365, 379], [379, 378], [378, 400],
  [400, 377], [377, 152], [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172],
  [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162], [162, 21], [21, 54],
  [54, 103], [103, 67], [67, 109], [109, 10],
  [33, 7], [7, 163], [163, 144], [144, 145], [145, 153], [153, 154], [154, 155], [155, 133],
  [362, 382], [382, 381], [381, 380], [380, 374], [374, 373], [373, 390], [390, 249], [249, 263],
  [61, 146], [146, 91], [91, 181], [181, 84], [84, 17], [17, 314], [314, 405], [405, 321],
  [321, 375], [375, 291], [61, 185], [185, 40], [40, 39], [39, 37], [37, 0], [0, 267],
  [267, 269], [269, 270], [270, 409], [409, 291],
  [70, 63], [63, 105], [105, 66], [66, 107], [336, 296], [296, 334], [334, 293], [293, 300],
];

const MediaPipeFaceContext = createContext<MediaPipeFaceContextValue>({
  landmarker: null,
  contourConnections: FALLBACK_CONTOUR_CONNECTIONS,
  status: "idle",
});

let landmarkerPromise: Promise<{ landmarker: any; contourConnections: MeshConnection[] }> | null = null;

function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = import("@mediapipe/tasks-vision").then(async ({ FaceLandmarker, FilesetResolver }) => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });

      return {
        landmarker,
        contourConnections: FaceLandmarker.FACE_LANDMARKS_CONTOURS as MeshConnection[],
      };
    });
  }
  return landmarkerPromise;
}

export function MediaPipeFaceProvider({ children }: { children: ReactNode }) {
  const [landmarker, setLandmarker] = useState<any | null>(null);
  const [contourConnections, setContourConnections] = useState<MeshConnection[]>(FALLBACK_CONTOUR_CONNECTIONS);
  const [status, setStatus] = useState<MediaPipeFaceContextValue["status"]>("idle");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    loadLandmarker()
      .then((loaded) => {
        if (cancelled) return;
        setLandmarker(loaded.landmarker);
        setContourConnections(loaded.contourConnections);
        setStatus("ready");
      })
      .catch((error) => {
        console.error("[MediaPipe FaceLandmarker]", error);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ landmarker, contourConnections, status }),
    [contourConnections, landmarker, status]
  );

  return <MediaPipeFaceContext.Provider value={value}>{children}</MediaPipeFaceContext.Provider>;
}

export function useMediaPipeFace() {
  return useContext(MediaPipeFaceContext);
}

export type { MeshConnection };
