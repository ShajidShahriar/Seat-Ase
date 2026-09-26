'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api.js';

// ---- Who is logged in (null when nobody is) ----

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const { user } = await api.get('/auth/me');
        return user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

// ---- Logging in and out ----

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials) => api.post('/auth/login', credentials),
    onSuccess: ({ user }) => queryClient.setQueryData(['me'], user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(['me'], null);
    },
  });
}

// ---- Signing up and verifying the phone ----

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (details) => api.post('/auth/signup', details),
    onSuccess: ({ user }) => queryClient.setQueryData(['me'], user),
  });
}

export function useSendOtp() {
  return useMutation({ mutationFn: () => api.post('/auth/otp/send') });
}

export function useVerifyOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code) => api.post('/auth/otp/verify', { code }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
}

// ---- Driver: the vehicle (null until they add one) ----

export function useVehicle() {
  return useQuery({
    queryKey: ['driver', 'vehicle'],
    queryFn: async () => {
      try {
        const { vehicle } = await api.get('/driver/vehicle');
        return vehicle;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

export function useAddVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (details) => api.post('/driver/vehicle', details),
    onSuccess: ({ vehicle }) => queryClient.setQueryData(['driver', 'vehicle'], vehicle),
  });
}

// ---- Driver: going online in an area, and offline again ----

export function useZones() {
  return useQuery({
    queryKey: ['zones'],
    queryFn: async () => (await api.get('/zones')).zones,
    staleTime: Infinity,
  });
}

export function useGoOnline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (zoneId) => api.post('/driver/online', { zoneId }),
    onSuccess: ({ vehicle }) => queryClient.setQueryData(['driver', 'vehicle'], vehicle),
  });
}

export function useGoOffline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/driver/offline'),
    onSuccess: ({ vehicle }) => queryClient.setQueryData(['driver', 'vehicle'], vehicle),
  });
}

// ---- Driver: passengers waiting for a car (refetched by live updates) ----

export function useDriverRequests({ enabled }) {
  return useQuery({
    queryKey: ['driver', 'requests'],
    queryFn: async () => (await api.get('/driver/requests')).requests,
    enabled,
  });
}

// ---- Passenger: searching places by name (stands and landmarks) ----

export function usePlaceSearch(text) {
  const query = text.trim();
  return useQuery({
    queryKey: ['places', query],
    queryFn: async () => (await api.get(`/places?q=${encodeURIComponent(query)}`)).places,
    enabled: query.length >= 2,
    staleTime: 5 * 60_000,
  });
}

// ---- Passenger: the stand a pickup place snaps to, and how far the walk is ----

export function useNearestStand(place) {
  return useQuery({
    queryKey: ['nearest-stand', place?.lat, place?.lng],
    queryFn: () => api.post('/places/nearest-stand', { lat: place.lat, lng: place.lng }),
    enabled: Boolean(place),
    staleTime: 5 * 60_000,
  });
}

// ---- Passenger: what this trip would cost, and how many Teslas are online ----

export function useFareQuote({ pickup, drop, seats }) {
  return useQuery({
    queryKey: ['fare-quote', pickup?.lat, pickup?.lng, drop?.lat, drop?.lng, seats],
    queryFn: () => api.post('/fares/quote', { pickupLat: pickup.lat, pickupLng: pickup.lng, dropLat: drop.lat, dropLng: drop.lng, seats }),
    enabled: Boolean(pickup && drop),
    staleTime: 60_000,
  });
}

export function useOnlineCount(zoneId) {
  return useQuery({
    queryKey: ['online-count', zoneId],
    queryFn: async () => (await api.get(`/zones/${zoneId}/online-count`)).count,
    enabled: Boolean(zoneId),
    refetchInterval: 30_000,
  });
}

// ---- Passenger: bookings, asking for a ride, cancelling ----

export function useBookings() {
  return useQuery({
    queryKey: ['bookings', 'list'],
    queryFn: async () => (await api.get('/requests')).requests,
  });
}

export function useCreateRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, key }) => api.post('/requests', body, { 'Idempotency-Key': key }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.post(`/requests/${id}/cancel`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

// ---- Driver: the current ride, accepting requests, and the ride buttons ----

export function useDriverRide({ enabled }) {
  return useQuery({
    queryKey: ['driver', 'ride'],
    queryFn: () => api.get('/driver/ride'),
    enabled,
  });
}

function useDriverAction(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['driver'] }),
  });
}

export const useAcceptRequest = () => useDriverAction((id) => api.post(`/driver/ride/requests/${id}/accept`));
export const useArrive = () => useDriverAction(() => api.post('/driver/ride/arrived'));
export const useCancelRide = () => useDriverAction(() => api.post('/driver/ride/cancel'));
export const useBoard = () => useDriverAction((id) => api.post(`/driver/ride/requests/${id}/board`));
export const useNoShow = () => useDriverAction((id) => api.post(`/driver/ride/requests/${id}/no-show`));
export const useStart = () => useDriverAction(() => api.post('/driver/ride/start'));
