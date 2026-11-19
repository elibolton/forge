<script lang="ts">
  let { label, checked, onchange }: { label: string; checked: boolean; onchange: (v: boolean) => void } = $props();
</script>

<label class="item">
  <span class="grow">{label}</span>
  <span class="toggle">
    <input type="checkbox" role="switch" {checked} onchange={(e) => onchange((e.currentTarget as HTMLInputElement).checked)} />
    <span></span>
  </span>
</label>
