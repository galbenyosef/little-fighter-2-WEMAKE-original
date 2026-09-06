const group_attack_kinds = new Set<string | number>();

export function reg_group_attack_kind(kind: string | number): void {
  group_attack_kinds.add(kind);
}

function buff_id_of(kind: string | number, entity_id: string): string {
  return `${kind}_${entity_id}`;
}

export function has_group_attack_buff(
  buffs: ReadonlyMap<string, unknown>,
  entity_id: string
): boolean {
  for (const kind of group_attack_kinds) {
    if (buffs.has(buff_id_of(kind, entity_id))) return true;
  }
  return false;
}
