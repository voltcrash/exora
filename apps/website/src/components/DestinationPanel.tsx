import { useState } from "react";
import type { DestinationPanelModel, PanelBlock } from "../destination-panel.ts";
import { readable, readableUnit } from "../readable.ts";
import { bindStyles } from "../styles/bind-styles.ts";
import { useTabList } from "../use-tab-list.ts";
import { FrameRateSignal } from "./FrameRateSignal.tsx";
import { ShareButton } from "./ShareButton.tsx";
import { Icon } from "./ui/Icon.tsx";
import { TabBar } from "./ui/TabBar.tsx";
import styles from "./Destination.module.css";

const cx = bindStyles(styles);

/* The orb is drawn for the kinds the stylesheet paints; anything else keeps the neutral body. */
const ORB_KINDS = new Set(["gas-giant", "ice-giant", "marker", "rocky", "super-earth"]);

/* A tile is a fixed width, so a value that spells a word out is set smaller rather than clipped. */
const metricLength = (value: string): "long" | "longest" | undefined =>
  value.length > 14 ? "longest" : value.length > 9 ? "long" : undefined;

const PanelBlockView = ({ block }: { block: PanelBlock }) => {
  switch (block.type) {
    case "facts":
      return (
        <dl className={cx("facts")}>
          {block.facts.map((fact) => (
            <div key={fact.label} className={cx("fact")} data-tone={fact.tone}>
              <dt>{readable(fact.label)}</dt>
              <dd>
                <strong>
                  {typeof fact.value === "string" ? readable(fact.value) : fact.value}
                  {fact.unit ? <span className={cx("fact-unit")}> {fact.unit}</span> : null}
                </strong>
                {fact.detail ? (
                  <small>
                    {typeof fact.detail === "string" ? readable(fact.detail) : fact.detail}
                  </small>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      );
    case "bodies":
      return (
        <div className={cx("group")}>
          {block.label ? <h3 className={cx("group-label")}>{readable(block.label)}</h3> : null}
          <ul className={cx("bodies")}>
            {block.bodies.map((body) => {
              const contents = (
                <>
                  <span
                    className={cx("orb")}
                    data-kind={body.kind && ORB_KINDS.has(body.kind) ? body.kind : undefined}
                    aria-hidden="true"
                  />
                  <span className={cx("body-copy")}>
                    <strong>{body.name}</strong>
                    {body.meta ? <small>{readable(body.meta)}</small> : null}
                  </span>
                  {body.status ? (
                    <small className={cx("body-status")}>{readable(body.status)}</small>
                  ) : body.onSelect ? (
                    <Icon className={cx("body-go")} name="arrow-right" size={16} />
                  ) : null}
                </>
              );
              return (
                <li key={body.id}>
                  {body.onSelect ? (
                    <button
                      className={cx("body")}
                      type="button"
                      onClick={body.onSelect}
                      aria-label={`Visit ${body.name}`}
                    >
                      {contents}
                    </button>
                  ) : (
                    <span className={cx("body")}>{contents}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      );
    case "custom":
      return (
        <div className={cx("group")}>
          {block.label ? <h3 className={cx("group-label")}>{readable(block.label)}</h3> : null}
          {block.content}
        </div>
      );
    case "status":
      return (
        <p className={cx("status")} data-tone={block.tone} role="status">
          {readable(block.text)}
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
 * Four headline readings, then everything else grouped into tabs, so a moon system with six
 * sections costs exactly as much screen as a black hole with one. On a wide screen it is an
 * inspector down the right edge; on a phone it is the lower part of the destination sheet.
 */
export const DestinationPanel = ({ fps, model }: DestinationPanelProps) => {
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
    <aside className={cx("panel")} data-testid="telemetry" aria-label={model.label}>
      <header className={cx("panel-head")}>
        <div>
          <p className={cx("panel-source")}>{readable(model.source)}</p>
          <h2 className={cx("panel-title")}>{model.title}</h2>
        </div>
        <ShareButton />
      </header>

      <dl className={cx("metrics")}>
        {model.metrics.map((metric) => (
          <div key={metric.label} className={cx("metric")}>
            <dt>{readable(metric.label)}</dt>
            <dd data-length={metricLength(metric.value)}>
              {readable(metric.value)}
              {metric.unit ? (
                <small>
                  {typeof metric.unit === "string" ? readableUnit(metric.unit) : metric.unit}
                </small>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      <div className={cx("panel-drawer")} data-testid="panel-drawer">
        {tabbed ? (
          <TabBar
            api={tabList}
            items={tabs.map((tab) => ({ count: tab.count, id: tab.id, label: tab.label }))}
            onSelect={setRequested}
          />
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

        <footer className={cx("panel-foot")}>
          <p>{typeof model.footer === "string" ? readable(model.footer) : model.footer}</p>
          <FrameRateSignal fps={fps} />
        </footer>
      </div>
    </aside>
  );
};
