<script setup lang="ts">
import { joinURL } from 'ufo'

const { data: page } = await useAsyncData('index', () => {
  return queryCollection('index').first()
})

const { url } = useSiteConfig()
const videoModalOpen = ref(false)

useSeoMeta({
  title: page.value.title,
  ogTitle: `${page.value.title} · NuxtHub`,
  description: page.value.description,
  ogDescription: page.value.description,
  ogImage: joinURL(url, '/social-card.png')
})
const introVideoLink = page.value.tool?.links?.find(link => link.id === 'intro-video')
const demoVideoLink = page.value.deploy?.links?.find(link => link.id === 'demo-video')
const videoLink = ref('')

onMounted(() => {
  if (introVideoLink) {
    document.body.querySelector(`#${introVideoLink.id}`)?.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        return
      }
      e?.preventDefault()
      videoLink.value = introVideoLink.to
      videoModalOpen.value = true
    })
  }
  if (demoVideoLink) {
    document.body.querySelector(`#${demoVideoLink.id}`)?.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        return
      }
      e?.preventDefault()
      videoLink.value = demoVideoLink.to
      videoModalOpen.value = true
    })
  }
})
</script>

<template>
  <UPage class="relative overflow-hidden">
    <UPageHero
      :description="page?.hero.description"
      orientation="horizontal"
      :ui="{
        container: 'py-20 sm:py-28 md:py-30 2xl:py-36'
      }"
    >
      <template #title>
        <MDC :value="page?.hero.title" unwrap="p" />
      </template>
      <template v-if="page?.hero.headline" #headline>
        <NuxtLink :to="page?.hero.headline.to">
          <UBadge color="neutral" variant="outline" size="lg" class="relative px-3 rounded-full font-semibold dark:hover:bg-neutral-400/15 dark:hover:ring-neutral-700">
            {{ page?.hero.headline.label }}
            <UIcon
              v-if="page?.hero.headline.icon"
              :name="page?.hero.headline.icon"
              class="size-4 pointer-events-none"
            />
          </UBadge>
        </NuxtLink>
      </template>

      <template #links>
        <div class="flex flex-col gap-y-6">
          <div class="flex flex-wrap gap-x-6 gap-y-3">
            <UButton to="/docs/getting-started/installation" size="lg" trailing-icon="i-lucide-arrow-right">
              Get started
            </UButton>
            <UInputCopy value="npx nuxthub deploy" size="lg" />
          </div>
          <div>
            <UAvatarGroup
              size="xs"
              class="float-left mr-3"
            >
              <UAvatar
                v-for="i in [1, 2, 3, 4]"
                :key="i"
                :src="`/images/landing/companies/logo-${i}-dark.svg`"
                class="bg-elevated p-[5px] hidden dark:inline-flex"
              />
              <UAvatar
                v-for="i in [1, 2, 3, 4]"
                :key="i"
                :src="`/images/landing/companies/logo-${i}-light.svg`"
                class="bg-elevated p-[5px] dark:hidden"
              />
              <UAvatar text="..." />
            </UAvatarGroup>
            <span class="text-sm text-elevated">
              Used and loved by <span class="font-medium text-highlighted">10K+ developers and teams</span>.
            </span>
          </div>
          <USeparator type="dashed" class="w-24" />
          <div class="flex flex-col gap-y-2">
            <p class="text-sm text-highlighted">
              “Nuxt on Cloudflare infra with minimal effort - this is huge!”
            </p>
            <div class="flex items-center flex-wrap gap-2 text-sm text-muted">
              <UAvatar src="https://avatars.githubusercontent.com/u/499550?v=4" size="xs" alt="Evan You" />
              <span class="font-medium text-default">Evan You</span>
              <span>•</span>
              <span>Author of Vue.js and Vite.</span>
            </div>
          </div>
        </div>
      </template>

      <UCard
        variant="soft"
        class="hidden lg:block max-2xl:absolute border border-accented bg-accented/40 max-2xl:-right-30 [--padding-card:--spacing(3)] rounded-[calc(theme(borderRadius.lg)+var(--padding-card))] 2xl:scale-110 2xl:origin-right"
        :ui="{
          body: 'lg:pl-(--padding-card) lg:pt-(--padding-card) lg:pb-(--padding-card) lg:pr-0 2xl:pr-(--padding-card) rounded-(--padding-card)'
        }"
      >
        <img
          src="/images/landing/hero-screenshot-dark.svg"
          class="hidden dark:lg:block size-full object-cover object-left h-[300px] lg:h-[380px] xl:h-[440px] 2xl:h-full"
          alt="NuxtHub Deploy page"
        >
        <img
          src="/images/landing/hero-screenshot-light.svg"
          class="hidden dark:hidden lg:block size-full object-cover object-left h-[300px] lg:h-[380px] xl:h-[440px] 2xl:h-full"
          alt="NuxtHub Deploy page"
        >
      </UCard>

      <UModal v-model:open="videoModalOpen" :ui="{ content: 'sm:max-w-4xl lg:max-w-5xl aspect-[16/9]' }">
        <template #content>
          <div class="p-3 h-full">
            <iframe
              width="100%"
              height="100%"
              :src="`https://www.youtube-nocookie.com/embed/${videoLink.split('=')[1]}`"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
            />
          </div>
        </template>
      </UModal>
    </UPageHero>
    <!-- features section -->
    <UPageSection :ui="{ container: 'py-6 pb-12 sm:py-12 lg:py-12 xl:pb-24' }">
      <ul class="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3 gap-y-6 lg:gap-x-8 lg:gap-y-8 xl:gap-y-10">
        <li
          v-for="feature in page?.features"
          :key="feature.title"
          class="flex items-start gap-x-3 relative group"
          :class="{ 'opacity-75': feature.soon }"
        >
          <NuxtLink v-if="feature.to" :to="feature.to" class="absolute inset-0 z-10" />
          <div class="p-[3px] border border-dashed rounded-md border-accented">
            <div class="bg-muted p-1.5 rounded-md flex items-center justify-center border border-default">
              <UIcon :name="feature.icon" class="size-6 flex-shrink-0" />
            </div>
          </div>
          <div class="flex flex-col">
            <h2 class="font-medium text-highlighted inline-flex items-center gap-x-1">
              {{ feature.title }} <UBadge v-if="feature.soon" color="neutral" variant="subtle" size="sm" class="rounded-full">
                Soon
              </UBadge>
              <UIcon v-if="feature.to" name="i-lucide-arrow-right" class="size-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200 -translate-x-1 group-hover:translate-x-0" />
            </h2>
            <p class="text-sm text-muted">
              {{ feature.description }}
            </p>
          </div>
        </li>
      </ul>
    </UPageSection>

    <UPageCTA
      :description="page.testimonial.quote"
      variant="subtle"
      class="rounded-none"
      :ui="{ container: 'sm:py-12 lg:py-12 sm:gap-8', description: 'before:content-[open-quote] after:content-[close-quote] !text-base' }"
    >
      <UUser
        v-bind="page.testimonial.author"
        size="xl"
        class="justify-center"
      />
    </UPageCTA>

    <UPageSection v-bind="page.tool" :ui="{ features: 'xl:grid-cols-4' }">
      <template #features>
        <UPageFeature
          v-for="(feature, index) in page.tool.features"
          :key="index"
          v-bind="feature"
          orientation="vertical"
          :ui="{ leadingIcon: 'text-highlighted' }"
        />
      </template>
    </UPageSection>

    <UPageSection class="relative" :links="page.deploy.links">
      <svg class="absolute top-0 inset-x-0 pointer-events-none opacity-30 dark:opacity-100" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 1017 181"><g opacity=".5"><mask id="c" fill="#fff"><path d="M0 0h1017v181H0V0Z" /></mask><path fill="url(#a)" fill-opacity=".5" d="M0 0h1017v181H0V0Z" /><path fill="url(#b)" d="M0 2h1017v-4H0v4Z" mask="url(#c)" /></g><defs><radialGradient id="a" cx="0" cy="0" r="1" gradientTransform="rotate(90.177 244.7795736 263.4645037) scale(161.501 509.002)" gradientUnits="userSpaceOnUse"><stop stop-color="#334155" /><stop offset="1" stop-color="#334155" stop-opacity="0" /></radialGradient><linearGradient id="b" x1="10.9784" x2="1017" y1="91" y2="90.502" gradientUnits="userSpaceOnUse"><stop stop-color="#334155" stop-opacity="0" /><stop offset=".395" stop-color="#334155" /><stop offset="1" stop-color="#334155" stop-opacity="0" /></linearGradient></defs></svg>
      <template #title>
        <MDC :value="page.deploy.title" unwrap="p" />
      </template>
      <template #description>
        <MDC :value="page.deploy.description" unwrap="p" />
      </template>
      <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 items-start justify-center">
        <li v-for="step in page?.deploy.steps" :key="step.title" class="flex flex-col gap-y-8 justify-center group">
          <UColorModeImage
            :light="step.image.light"
            :dark="step.image.dark"
            :width="step.image.width"
            :height="step.image.height"
            :alt="step.title"
            lazy
          />
          <div>
            <h2 class="font-medium text-highlighted">
              {{ step.title }}
            </h2>
            <p class="text-sm text-muted">
              {{ step.description }}
            </p>
          </div>
        </li>
      </ul>
    </UPageSection>
    <UPageCTA variant="naked" :ui="{ container: 'px-4 sm:px-6 lg:px-8', title: 'text-left sm:text-4xl lg:text-5xl font-medium', description: 'text-left' }">
      <template #title>
        <MDC :value="page.fullStack.title" unwrap="p" />
      </template>
      <template #description>
        <MDC :value="page.fullStack.description" unwrap="p" />
      </template>
    </UPageCTA>
    <UPageSection
      v-for="(section, index) in page.sections"
      :key="index"
      :title="section.title"
      :links="section.links"
      :reverse="index % 2 === 1"
      orientation="horizontal"
      :ui="{
        container: 'py-16 sm:py-16 lg:py-16',
        title: 'text-xl sm:text-2xl lg:text-3xl font-semibold',
        description: 'text-base mt-3'
      }"
    >
      <template #headline>
        <div class="flex items-center gap-1.5">
          <UIcon :name="section.headline.icon" class="w-5 h-5 flex-shrink-0 text-highlighted dark:text-primary" />
          <span class="font-medium text-xs uppercase text-accented">{{ section.headline.title }}</span>
        </div>
      </template>
      <template #description>
        <MDC :value="section.description" unwrap="p" />
      </template>
      <template #features>
        <UPageFeature
          v-for="(feature, i) in section.features"
          :key="i"
          v-bind="feature"
          :ui="{ title: 'text-accented', leadingIcon: 'text-accented' }"
        />
      </template>
      <UColorModeImage
        :light="section.image.light"
        :dark="section.image.dark"
        :width="section.image.width"
        :height="section.image.height"
        :alt="section.title"
      />
    </UPageSection>
    <UPageSection
      :title="page.testimonials.title"
      :description="page.testimonials.description"
    >
      <UContainer>
        <UPageColumns class="xl:columns-4">
          <UPageCard
            v-for="(testimonial, index) in page.testimonials.items"
            :key="index"
            variant="subtle"
            :description="testimonial.quote"
            :ui="{ description: 'before:content-[open-quote] after:content-[close-quote]' }"
          >
            <template #footer>
              <UUser
                v-bind="testimonial.author"
                size="xl"
              />
            </template>
          </UPageCard>
        </UPageColumns>
      </UContainer>
    </UPageSection>
    <PageSectionCTA loose />
  </UPage>
</template>

<style lang="postcss">
.hero_code div div {
  @apply dark:bg-neutral-900/60 backdrop-blur-3xl bg-white/60;
}
</style>
