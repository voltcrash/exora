import { afterEach, expect, test } from "vite-plus/test";
import template from "../index.html?raw";
import { homepage, renderBody } from "../discovery/pages.ts";

let frame: HTMLIFrameElement | undefined;

afterEach(() => frame?.remove());

const openStartup = async (scripting = true): Promise<Document> => {
  frame = document.createElement("iframe");
  frame.width = String(window.innerWidth);
  frame.height = String(window.innerHeight);
  if (!scripting) frame.sandbox.add("allow-same-origin");
  const loaded = new Promise<void>((resolve) => frame!.addEventListener("load", () => resolve()));
  frame.srcdoc = template
    .replace("<!-- discovery:body -->", renderBody(homepage))
    .replace(/<script type="module"[^>]*><\/script>/, "");
  document.body.append(frame);
  await loaded;
  return frame.contentDocument!;
};

test("the orbit loader covers discovery content before any application JavaScript loads", async () => {
  const document = await openStartup();
  const view = document.defaultView!;
  expect(view.getComputedStyle(document.querySelector(".app-startup")!).display).toBe("grid");
  expect(view.getComputedStyle(document.querySelector(".discovery")!).display).toBe("none");
  expect(view.getComputedStyle(document.body).backgroundColor).toBe("rgb(0, 0, 0)");
});

test("discovery content remains readable when JavaScript is disabled", async () => {
  const document = await openStartup(false);
  const view = document.defaultView!;
  expect(view.getComputedStyle(document.querySelector(".app-startup")!).display).toBe("none");
  expect(view.getComputedStyle(document.querySelector(".discovery")!).display).toBe("block");
  expect(document.querySelector("h1")?.textContent).toBe(homepage.title);
});
