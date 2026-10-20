type MemberAvatarProps = {
  name: string;
  number: string | null;
};

/**
 * 部員のアイコン。いまは背番号の数字(けーいちの決定、2026-10-20)。背番号のない人は、名前の1文字目。
 * 表示名は「15林」のように背番号が前に付いているので、背番号の分を外してから1文字目を取る。
 */
export function MemberAvatar({ name, number }: MemberAvatarProps) {
  const label = number ?? (name.replace(/^[0-9A-Za-z]+/, "").slice(0, 1) || name.slice(0, 1));
  return (
    <span className="tp-avatar" title={name} aria-label={name} data-long={label.length > 2 ? "" : undefined}>
      {label}
    </span>
  );
}
