import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Icon, type IconName } from "./Icon.tsx";
import styles from "./ui.module.css";

export type ButtonVariant = "ghost" | "primary" | "secondary" | "surface";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  icon?: IconName;
  iconEnd?: IconName;
  ref?: Ref<HTMLButtonElement>;
  size?: "md" | "sm";
  variant?: ButtonVariant;
}

/*
 * The one button. A variant says how loud it is — `primary` is lit by the local star and there is
 * at most one per view — and an icon with no children makes it square, in which case the caller
 * owes it an `aria-label`.
 */
export const Button = ({
  children,
  className,
  icon,
  iconEnd,
  ref,
  size = "md",
  type = "button",
  variant = "secondary",
  ...rest
}: ButtonProps) => {
  const iconOnly = icon !== undefined && (children === undefined || children === null);
  return (
    <button
      ref={ref}
      className={className ? `${styles["button"]} ${className}` : styles["button"]}
      data-variant={variant}
      data-size={size}
      data-icon-only={iconOnly || undefined}
      type={type}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} /> : null}
      {iconOnly ? null : <span className={styles["button-label"]}>{children}</span>}
      {iconEnd ? <Icon name={iconEnd} size={size === "sm" ? 14 : 16} /> : null}
    </button>
  );
};
