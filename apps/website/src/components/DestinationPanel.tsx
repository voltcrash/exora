import { useState } from "react";
import type { DestinationPanelModel, PanelBlock } from "../destination-panel.ts";
import { useTabList } from "../use-tab-list.ts";
import { FrameRateSignal } from "./FrameRateSignal.tsx";
import hudStyles from "./DestinationHud.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(hudStyles);

/* The orb is drawn for the kinds the stylesheet paints; anything else keeps the neutral body. */
const ORB_KINDS = new Set(["gas-giant", "ice-giant", "marker"]);

/* A tile is a fixed width, so a value that spells a word out is set smaller rather than clipped. */
const metricLength = (value: string): "long" | "longest" | undefined =>
  value.length > 15 ? "longest" : value.length > 11 ? "long" : undefined;

const PanelBlockView = ({ block }: { block: PanelBlock }) => {
  switch (block.type) {
    case "facts":
      return (
        <dl className={cx("panel-facts")}>
          {block.facts.map((fact) => (
            <div key={fact.label} data-tone={fact.tone}>
              <dt>{fact.label}</dt>
              <dd>
                <strong>{fact.value}</strong>
                {fact.detail ? <small>{fact.detail}</small> : null}
              </dd>
            </div>
          ))}
        </dl>
      );
    case "bodies":
      return (
        <div className={cx("panel-group")}>
          {block.label ? <p className={cx("panel-group-label")}>{block.label}</p> : null}
          <ul className={cx("panel-bodies")}>
            {block.bodies.map((body) => {
              const action = body.status ?? (body.onSelect ? "VISIT ↗" : null);
              const contents = (
                <>
                  <span
                    className={cx(
                      `panel-orb ${body.kind && ORB_KINDS.has(body.kind) ? body.kind : ""}`,
                    )}
                    aria-hidden="true"
                  />
                  <span className={cx("panel-body-copy")}>
                    <strong>{body.name}</strong>
                    {body.meta ? <small>{body.meta}</small> : null}
                  </span>
                  {action ? <small className={cx("panel-body-action")}>{action}</small> : null}
                </>
              );
              return (
                <li key={body.id}>
                  {body.onSelect ? (
                    <button type="button" onClick={body.onSelect} aria-label={`Visit ${body.name}`}>
                      {contents}
                    </button>
                  ) : (
                    <span>{contents}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      );
    case "custom":
      return (
        <div className={cx("panel-group")}>
          {block.label ? <p className={cx("panel-group-label")}>{block.label}</p> : null}
          {block.content}
        </div>
      );
    case "status":
      return (
        <p className={cx("panel-status")} data-tone={block.tone} role="status">
          {block.text}
        </p>
      );
  }
};

interface DestinationPanelProps {
  fps: string;
  model: DestinationPanelModel;
}

/*
 * WHAT IS KNOWN — one instrument, whatever the destination is.
 *
 * Every reading a main screen carries now arrives here: the four measured values, the places this
 * object can be left for, and the rest grouped into tabs. A tabbed body is what makes the panel
 * the same size on a moon with a plasma torus as on a horizon with one disclosure — the sections
 * a destination happens to have cost a row of labels rather than a column of stacked cards.
 *
 * The same markup is the phone's bottom sheet. `data-expanded` is inert above the sheet breakpoint
 * and there is no viewport measured in JavaScript, so the panel renders identically on a server,
 * in a test and on a phone, and a resize never catches it in the wrong composition.
 */
export const DestinationPanel = ({ fps, model }: DestinationPanelProps) => {
  const [expanded, setExpanded] = useState(false);
  const [requested, setRequested] = useState("");
  const tabs = model.tabs;
  const active = tabs.find((tab) => tab.id === requested) ?? tabs[0];
  const tabList = useTabList({
    label: `${model.title} sections`,
    list: "destination",
    onSelect: setRequested,
    value: active?.id ?? "",
    values: tabs.map((tab) => tab.id),
  });
  const tabbed = tabs.length > 1;

  return (
    <aside
      className={cx("panel")}
      data-testid="telemetry"
      data-expanded={expanded}
      aria-label={model.label}
    >
      <div className={cx("panel-head")}>
        <span className={cx("panel-title")}>
          <small>{model.source}</small>
          <strong>{model.title}</strong>
        </span>
        <FrameRateSignal fps={fps} />
        <button
          className={cx("panel-disclosure")}
          data-testid="panel-disclosure"
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "Hide destination readings" : "Show destination readings"}
          onClick={() => setExpanded((open) => !open)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 10.5 8 6l4.5 4.5" />
          </svg>
        </button>
      </div>

      <dl className={cx("panel-metrics")}>
        {model.metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd data-length={metricLength(metric.value)}>
              {metric.value}
              {metric.unit ? <small>{metric.unit}</small> : null}
            </dd>
          </div>
        ))}
      </dl>

      {model.links.length > 0 ? (
        <div className={cx("panel-links")}>
          {model.links.map((link) => (
            <button
              key={link.id}
              className={cx("panel-link")}
              data-tone={link.tone ?? "gold"}
              type="button"
              disabled={link.disabled}
              aria-pressed={link.pressed}
              onClick={link.onSelect}
            >
              <span aria-hidden="true">{link.glyph}</span>
              <strong>{link.title}</strong>
              <small>{link.action}</small>
            </button>
          ))}
        </div>
      ) : null}

      {model.links.map((link) =>
        link.error ? (
          <p
            className={cx("panel-status panel-link-status")}
            data-tone="accent"
            key={link.id}
            role="status"
          >
            {link.error}
          </p>
        ) : null,
      )}

      <div className={cx("panel-drawer")} data-testid="panel-drawer">
        {tabbed ? (
          <div className={cx("panel-tabs")} {...tabList.tabListProps}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={cx("panel-tab")}
                {...tabList.tabProps(tab.id)}
                onClick={() => setRequested(tab.id)}
              >
                {tab.label}
                {tab.count === undefined ? null : <small>{tab.count}</small>}
              </button>
            ))}
          </div>
        ) : null}

        {active ? (
          <div
            className={cx("panel-body")}
            data-testid="panel-body"
            {...(tabbed ? tabList.panelProps(active.id) : {})}
          >
            {active.blocks.map((block, index) => (
              <PanelBlockView key={`${block.type}-${String(index)}`} block={block} />
            ))}
          </div>
        ) : null}

        <p className={cx("panel-footer")}>{model.footer}</p>
      </div>
    </aside>
  );
};
